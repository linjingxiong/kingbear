import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  InboundStatus,
  type PartyBase,
  type PartyLedgerRow,
  type PartyListItem,
  type PartyRole,
} from '@kingbear/shared';
import { Factory } from '../factory/schemas/factory.schema';
import { FactoryService } from '../factory/factory.service';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { InboundReturn } from '../inbound-return/schemas/inbound-return.schema';
import { MaterialIssuance } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt } from '../oem-receipt/schemas/oem-receipt.schema';
import { CommonMaterialReturn } from '../common-material-return/schemas/common-material-return.schema';
import { Product } from '../product/schemas/product.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';

const ROLES: PartyRole[] = ['toy_factory', 'oem_factory', 'me'];

export function assertRole(role: string): PartyRole {
  if (!ROLES.includes(role as PartyRole)) throw new BadRequestException('未知的往来单位类型');
  return role as PartyRole;
}

/**
 * 各张单据表里"这条记录属于哪个单位"的 id 字段，有的存的是字符串、有的是 ObjectId
 * （历史遗留：入库单是 ObjectId，退货/代工厂那几张表存的是字符串），所以查询时两种都匹配，
 * 不去猜每张表到底存的是哪种——猜错了就永远查不出来（之前踩过）。
 */
function idIn(id: string) {
  return { $in: [id, new Types.ObjectId(id)] } as never;
}

/** "2026-08" → 当月 [1号, 下月1号) 的范围，跟应收账单同一个算法 */
type DateRange = { $gte: Date; $lt: Date };

function monthRange(yearMonth?: string): DateRange | null {
  if (!yearMonth) return null;
  const [y, m] = yearMonth.split('-').map(Number);
  return { $gte: new Date(y, m - 1, 1), $lt: new Date(y, m, 1) };
}

/** 有月份范围就返回 { 日期字段: 范围 }，没有就是空对象，直接展开进查询条件里 */
function inRange(field: string, range: DateRange | null): Record<string, DateRange> {
  return range ? { [field]: range } : {};
}

@Injectable()
export class PartyService {
  constructor(
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(InboundReturn.name) private readonly outboundModel: Model<InboundReturn>,
    @InjectModel(MaterialIssuance.name) private readonly issuanceModel: Model<MaterialIssuance>,
    @InjectModel(OemReceipt.name) private readonly receiptModel: Model<OemReceipt>,
    @InjectModel(CommonMaterialReturn.name) private readonly commonReturnModel: Model<CommonMaterialReturn>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(ProductGroup.name) private readonly groupModel: Model<ProductGroup>,
    private readonly factoryService: FactoryService,
  ) {}

  /** 玩具厂 + 代工厂放在一个列表里，每个带上流水概况；流水条数不多（单用户内部工具），
   * 直接逐个单位把流水算出来数一下，比另写一套聚合更不容易跟详情页的口径对不上 */
  async list(): Promise<PartyListItem[]> {
    const [factories, oemFactories, factoryStats] = await Promise.all([
      this.factoryModel.find().sort({ createdAt: 1 }).lean(),
      this.oemFactoryModel.find().sort({ createdAt: 1 }).lean(),
      this.factoryService.findAll(),
    ]);
    const statsById = new Map<string, { productCount: number; processedAmount: number }>();
    for (const s of factoryStats) statsById.set(s.id, { productCount: s.productCount, processedAmount: s.processedAmount });
    const bases: PartyBase[] = [
      ...factories.map((f) => ({
        id: String(f._id),
        role: 'toy_factory' as const,
        name: f.name,
        contact: f.contact,
        phone: f.phone,
        address: f.address,
        remark: f.remark,
      })),
      ...oemFactories.map((f) => ({
        id: String(f._id),
        role: 'oem_factory' as const,
        name: f.name,
        contact: f.contact,
        phone: f.phone,
        address: f.address,
        remark: f.remark,
      })),
    ];

    const items: PartyListItem[] = await Promise.all(
      bases.map(async (base) => {
        const rows = await this.ledger(base.role, base.id);
        return {
          ...base,
          ...(base.role === 'toy_factory' ? statsById.get(base.id) : {}),
          recordCount: rows.length,
          inCount: rows.filter((r) => r.direction === 'in').length,
          outCount: rows.filter((r) => r.direction === 'out').length,
          lastDate: rows[0]?.date ?? null, // ledger 已经按日期倒序，第一条就是最近的
        };
      }),
    );

    // "我"是中间环节：每个对象的入库=货从我手里出库、对象的出库=货到我手里入库，数字直接由上面各单位倒过来加总，
    // 不用再把全部流水算第二遍
    const me: PartyListItem = {
      id: 'me',
      role: 'me',
      name: '我（中间环节）',
      remark: '玩具厂和代工厂/工人之间的中转：所有货从我这里入库、出库',
      recordCount: items.reduce((n, p) => n + p.recordCount, 0),
      inCount: items.reduce((n, p) => n + p.outCount, 0),
      outCount: items.reduce((n, p) => n + p.inCount, 0),
      lastDate: items.map((p) => p.lastDate).filter((d): d is string => !!d).sort().pop() ?? null,
    };
    return [me, ...items];
  }

  async detail(role: PartyRole, id: string): Promise<PartyBase> {
    // "我"不是数据库里的一条记录，是个固定的虚拟节点
    if (role === 'me') return { id: 'me', role: 'me', name: '我（中间环节）' };
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id 格式不对');
    const doc =
      role === 'toy_factory'
        ? await this.factoryModel.findById(id).lean()
        : await this.oemFactoryModel.findById(id).lean();
    if (!doc) throw new NotFoundException('往来单位不存在');
    return {
      id: String(doc._id),
      role,
      name: doc.name,
      contact: doc.contact,
      phone: doc.phone,
      address: doc.address,
      remark: doc.remark,
    };
  }

  /**
   * 删除一个往来单位。原来玩具厂/代工厂各自的删除接口是直接删，名下有产品、单据也照删，
   * 会留下一堆没主的数据——数据最重要，所以合并页面之后删除统一走这里：名下只要还有任何
   * 产品/单据就拒绝，并告诉用户具体是什么、有几条；一条都没有才真的删。
   */
  async remove(role: PartyRole, id: string): Promise<{ success: boolean }> {
    if (role === 'me') throw new BadRequestException('"我"是固定的中间环节，不能删除');
    await this.detail(role, id); // 不存在就 404，id 不合法就 400

    const refs: Array<[string, Promise<number>]> =
      role === 'toy_factory'
        ? [
            ['产品', this.groupModel.countDocuments({ factoryId: idIn(id) } as never)],
            ['工序', this.productModel.countDocuments({ factoryId: idIn(id) } as never)],
            ['入库单', this.inboundModel.countDocuments({ factoryId: idIn(id) } as never)],
            ['出库单', this.outboundModel.countDocuments({ factoryId: idIn(id) } as never)],
          ]
        : [
            ['物料发放', this.issuanceModel.countDocuments({ oemFactoryId: idIn(id) } as never)],
            ['成品回收', this.receiptModel.countDocuments({ oemFactoryId: idIn(id) } as never)],
            ['通用物料回收', this.commonReturnModel.countDocuments({ oemFactoryId: idIn(id) } as never)],
          ];
    const counts = await Promise.all(refs.map(async ([label, p]) => [label, await p] as const));
    const used = counts.filter(([, n]) => n > 0).map(([label, n]) => `${n} 条${label}`);
    if (used.length) {
      throw new BadRequestException(`不能删除：这个${role === 'toy_factory' ? '玩具厂' : '代工厂'}名下还有 ${used.join('、')}，先处理掉这些数据再删`);
    }

    if (role === 'toy_factory') await this.factoryModel.findByIdAndDelete(id);
    else await this.oemFactoryModel.findByIdAndDelete(id);
    return { success: true };
  }

  /** 这个单位的全部流水，按日期倒序（同一天按来源/单号稳定排序）。yearMonth 不传就是所有时间 */
  async ledger(role: PartyRole, id: string, yearMonth?: string): Promise<PartyLedgerRow[]> {
    if (role === 'me') return this.meLedger(yearMonth);
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id 格式不对');
    const rows =
      role === 'toy_factory' ? await this.toyFactoryRows(id, yearMonth) : await this.oemFactoryRows(id, yearMonth);
    return rows.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }

  /**
   * "我"的总账：我在玩具厂和代工厂/工人之间，货都从我这里过。把所有对象各自的流水合起来，
   * 方向整体反过来（对象的"入库"= 货流进对象 = 从我手里出库；对象的"出库"= 货到我手里 = 我入库），
   * 并标上每一笔的对方是谁。同一笔单据在对象那边和在我这边是同一条数据的两个视角，不会重复入库。
   */
  private async meLedger(yearMonth?: string): Promise<PartyLedgerRow[]> {
    const [factories, oemFactories] = await Promise.all([this.factoryModel.find().lean(), this.oemFactoryModel.find().lean()]);
    const targets = [
      ...factories.map((f) => ({ id: String(f._id), role: 'toy_factory' as const, name: f.name })),
      ...oemFactories.map((f) => ({ id: String(f._id), role: 'oem_factory' as const, name: f.name })),
    ];
    const perParty = await Promise.all(
      targets.map(async (t) =>
        (await this.ledger(t.role, t.id, yearMonth)).map(
          (r): PartyLedgerRow => ({
            ...r,
            direction: r.direction === 'in' ? 'out' : 'in',
            partyId: t.id,
            partyName: t.name,
            partyRole: t.role,
          }),
        ),
      ),
    );
    return perParty.flat().sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }

  /* ---------- 玩具厂：入库单（入库，货流进玩具厂）+ 出库单的发料/退货（出库，货流出玩具厂） ---------- */
  private async toyFactoryRows(id: string, yearMonth?: string): Promise<PartyLedgerRow[]> {
    const range = monthRange(yearMonth);
    const [inbounds, outbounds] = await Promise.all([
      // 跟应收账单同一个口径：只算已经确认完成的入库单（识别中/待确认的还没有货号明细）
      this.inboundModel
        .find({ factoryId: idIn(id), status: InboundStatus.Completed, ...inRange('inboundDate', range) } as never)
        .lean(),
      this.outboundModel.find({ factoryId: idIn(id), ...inRange('returnDate', range) } as never).lean(),
    ]);

    const rows: PartyLedgerRow[] = [];
    for (const r of inbounds) {
      r.items.forEach((item, i) => {
        rows.push({
          key: `inbound:${r._id}:${i}`,
          source: 'inbound',
          sourceId: String(r._id),
          date: r.inboundDate.toISOString(),
          direction: 'in',
          typeLabel: '入库单',
          itemKind: 'product',
          itemKey: item.sku,
          itemName: item.name,
          sku: item.sku,
          qty: item.qtyFinal,
          weightJin: item.weightJin,
          unitWeightG: item.unitWeightG,
          code: r.code,
          remark: item.remark,
          images: r.imageUrl ? [r.imageUrl] : [],
        });
      });
    }
    for (const r of outbounds) {
      // 老记录没有 kind 字段（这张表最早只存退货），当退货处理
      const isIssue = r.kind === 'issue';
      rows.push({
        key: `outbound:${r._id}`,
        source: isIssue ? 'outbound_issue' : 'outbound_return',
        sourceId: String(r._id),
        date: r.returnDate.toISOString(),
        direction: 'out',
        typeLabel: isIssue ? '出库单·发料' : '出库单·退货',
        itemKind: 'product',
        itemKey: r.sku,
        itemName: r.name,
        sku: r.sku,
        qty: r.qty,
        weightJin: r.weightJin,
        unitWeightG: r.unitWeightG,
        reason: r.reason || undefined,
        remark: r.remark,
        images: r.images ?? [],
      });
    }
    return rows;
  }

  /* ---------- 代工厂：物料发放（入库，料流进代工厂）+ 成品回收、通用物料回收（出库，货流出代工厂） ---------- */
  private async oemFactoryRows(id: string, yearMonth?: string): Promise<PartyLedgerRow[]> {
    const range = monthRange(yearMonth);
    const [issuances, receipts, commonReturns] = await Promise.all([
      this.issuanceModel.find({ oemFactoryId: idIn(id), ...inRange('issuedDate', range) } as never).lean(),
      this.receiptModel.find({ oemFactoryId: idIn(id), ...inRange('receivedDate', range) } as never).lean(),
      this.commonReturnModel.find({ oemFactoryId: idIn(id), ...inRange('returnedDate', range) } as never).lean(),
    ]);

    // 物料发放要显示"这批料是给哪个产品用的"、成品回收要显示货号名称，一次性批量查出来
    const groupIds = [...new Set(issuances.map((r) => (r.productGroupId ? String(r.productGroupId) : '')).filter(Boolean))];
    const productIds = [...new Set(receipts.map((r) => String(r.productId)))].filter((v) => Types.ObjectId.isValid(v));
    // 显式声明 Map 的类型、循环里手动 set：直接 new Map(list.map(...)) 让 TS 自己推断，
    // 碰上 .lean() 的类型会推成 unknown/{}（跟别处 .lean() 拼结果同一个坑）
    const groupName = new Map<string, string>();
    if (groupIds.length) {
      for (const g of await this.groupModel.find({ _id: { $in: groupIds } }).lean()) groupName.set(String(g._id), g.name);
    }
    const productById = new Map<string, { sku: string; name: string }>();
    if (productIds.length) {
      for (const p of await this.productModel.find({ _id: { $in: productIds } }).lean()) {
        productById.set(String(p._id), { sku: p.sku, name: p.name });
      }
    }

    const rows: PartyLedgerRow[] = [];
    for (const r of issuances) {
      const gid = r.productGroupId ? String(r.productGroupId) : '';
      rows.push({
        key: `issuance:${r._id}`,
        source: 'material_issuance',
        sourceId: String(r._id),
        date: r.issuedDate.toISOString(),
        direction: 'in',
        typeLabel: gid ? '物料发放' : '通用物料发放',
        itemKind: 'material',
        itemKey: r.materialName,
        itemName: r.materialName,
        group: gid ? groupName.get(gid) : undefined,
        qty: r.qty,
        remark: r.remark,
        images: r.imageUrl ? [r.imageUrl] : [],
      });
    }
    for (const r of receipts) {
      const p = productById.get(String(r.productId));
      rows.push({
        key: `receipt:${r._id}`,
        source: 'oem_receipt',
        sourceId: String(r._id),
        date: r.receivedDate.toISOString(),
        direction: 'out',
        typeLabel: '成品回收',
        itemKind: 'product',
        itemKey: p?.sku ?? '未知货号',
        itemName: p?.name ?? '未知产品',
        sku: p?.sku,
        qty: r.qty,
        weightJin: r.weightJin,
        unitWeightG: r.unitWeightG,
        remark: r.remark,
        images: r.images ?? [],
      });
    }
    for (const r of commonReturns) {
      rows.push({
        key: `common:${r._id}`,
        source: 'common_material_return',
        sourceId: String(r._id),
        date: r.returnedDate.toISOString(),
        direction: 'out',
        typeLabel: '通用物料回收',
        itemKind: 'material',
        itemKey: r.commonMaterialName,
        itemName: r.commonMaterialName,
        qty: r.qty,
        remark: r.remark,
        images: [],
      });
    }
    return rows;
  }
}
