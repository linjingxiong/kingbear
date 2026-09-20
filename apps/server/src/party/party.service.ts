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
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { InboundReturn } from '../inbound-return/schemas/inbound-return.schema';
import { MaterialIssuance } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt } from '../oem-receipt/schemas/oem-receipt.schema';
import { CommonMaterialReturn } from '../common-material-return/schemas/common-material-return.schema';
import { Product } from '../product/schemas/product.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';

const ROLES: PartyRole[] = ['toy_factory', 'oem_factory'];

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
  ) {}

  /** 玩具厂 + 代工厂放在一个列表里，每个带上流水概况；流水条数不多（单用户内部工具），
   * 直接逐个单位把流水算出来数一下，比另写一套聚合更不容易跟详情页的口径对不上 */
  async list(): Promise<PartyListItem[]> {
    const [factories, oemFactories] = await Promise.all([
      this.factoryModel.find().sort({ createdAt: 1 }).lean(),
      this.oemFactoryModel.find().sort({ createdAt: 1 }).lean(),
    ]);
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

    return Promise.all(
      bases.map(async (base) => {
        const rows = await this.ledger(base.role, base.id);
        return {
          ...base,
          recordCount: rows.length,
          inCount: rows.filter((r) => r.direction === 'in').length,
          outCount: rows.filter((r) => r.direction === 'out').length,
          lastDate: rows[0]?.date ?? null, // ledger 已经按日期倒序，第一条就是最近的
        };
      }),
    );
  }

  async detail(role: PartyRole, id: string): Promise<PartyBase> {
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

  /** 这个单位的全部流水，按日期倒序（同一天按来源/单号稳定排序）。yearMonth 不传就是所有时间 */
  async ledger(role: PartyRole, id: string, yearMonth?: string): Promise<PartyLedgerRow[]> {
    if (!Types.ObjectId.isValid(id)) throw new BadRequestException('id 格式不对');
    const rows =
      role === 'toy_factory' ? await this.toyFactoryRows(id, yearMonth) : await this.oemFactoryRows(id, yearMonth);
    return rows.sort((a, b) => b.date.localeCompare(a.date) || a.key.localeCompare(b.key));
  }

  /* ---------- 玩具厂：入库单（发出）+ 出库单的发料/退货（收进） ---------- */
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
          direction: 'out',
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
        direction: 'in',
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

  /* ---------- 代工厂：物料发放（发出）+ 成品回收、通用物料回收（收进） ---------- */
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
        direction: 'out',
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
        direction: 'in',
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
        direction: 'in',
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
