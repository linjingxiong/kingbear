import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { AnyKeys, FilterQuery, Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { InboundStatus, QuantitySource, type DuplicateConflictResponse, type InboundListRow } from '@kingbear/shared';
import { InboundRecord } from './schemas/inbound-record.schema';
import { ConfirmInboundDto } from './dto/confirm-inbound.dto';
import { SearchInboundDto } from './dto/search-inbound.dto';
import { OCR_PROVIDER } from '../ocr/ocr.module';
import type { OcrProvider } from '../ocr/ocr.types';
import { FactoryService } from '../factory/factory.service';
import { ProductService } from '../product/product.service';
import { calculateQuantity, hasQuantityDiff } from '../common/utils/quantity.util';

@Injectable()
export class InboundService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @Inject(OCR_PROVIDER) private readonly ocrProvider: OcrProvider,
    private readonly factoryService: FactoryService,
    private readonly productService: ProductService,
  ) {}

  /**
   * 上传图片后：存图 → 建 processing 记录 → 调 OCR → 后处理 → 落成 pending_confirm。
   * 先按内容算个哈希，跟已经上传过的图片比一下——同一张单据照片被误传两次（比如手抖点了
   * 两下、或者忘了传过又传一遍）是最容易发生的重复，force 不为 true 时先拦一次让人工确认。
   */
  async createFromUpload(imageUrl: string, imageFilePath: string, force = false) {
    const imageHash = createHash('sha256').update(await readFile(imageFilePath)).digest('hex');

    if (!force) {
      const existing = await this.inboundModel.findOne({ imageHash }).sort({ createdAt: -1 });
      if (existing) {
        throw new ConflictException({
          message: `这张图片跟入库单「${existing.code}」看起来是同一张，是不是重复上传了？`,
          duplicateType: 'image',
          conflictCodes: [existing.code],
        } satisfies DuplicateConflictResponse);
      }
    }

    const record = await this.createWithGeneratedCode((code) => ({
      code,
      factoryId: null,
      needFactorySelect: true,
      inboundDate: new Date(),
      imageUrl,
      imageHash,
      ocrRawResult: null,
      status: InboundStatus.Processing,
      items: [],
    }));

    // imageUrl 是存进数据库、给前端展示用的对外访问路径（/uploads/...）；
    // OCR Provider 需要读文件内容，传的是磁盘上的真实路径
    const ocrResult = await this.ocrProvider.recognizeInboundImage(imageFilePath);

    // 玩具厂识别 → 模糊匹配已有玩具厂，失败则留给人工在确认页选
    let factoryId: Types.ObjectId | null = null;
    let needFactorySelect = true;
    if (ocrResult.factoryName) {
      const matched = await this.factoryService.findByFuzzyName(ocrResult.factoryName);
      if (matched) {
        factoryId = matched._id as Types.ObjectId;
        needFactorySelect = false;
      }
    }

    // 日期识别失败，或者识别出来的年份明显离谱（大模型偶尔会在单据没写清楚年份的时候
    // 瞎猜一个，比如把"7月28日"猜成 2028 年）→ 默认当天。默认成今天而不是将错就错，
    // 是故意的：今天的日期跟单据上手写的月/日对不上会很显眼，人一眼就看出来要手动改，
    // 比一个"看着像真的"但其实是瞎猜的日期（比如 2028）更容易被忽略掉
    const parsedDate = ocrResult.date ? new Date(ocrResult.date) : null;
    const inboundDate = parsedDate && isPlausibleDate(parsedDate) ? parsedDate : new Date();

    // 每行：数量识别缺失就按公式算；两者都在就对比出差异
    const items = await Promise.all(
      ocrResult.items.map(async (raw) => {
        const qtyCalculated = calculateQuantity(raw.weightJin, raw.unitWeightG);
        const diff = hasQuantityDiff(raw.qtyDeclared, qtyCalculated);
        const qtyFinal = raw.qtyDeclared ?? qtyCalculated;

        // 货号在该玩具厂下已有产品档案就带出工厂价，否则留 0 让人工确认时填
        let factoryPrice = 0;
        let productId: Types.ObjectId | null = null;
        if (factoryId) {
          const product = await this.productService
            .findByFactory(String(factoryId))
            .then((list) => list.find((p) => p.sku === raw.sku));
          if (product) {
            productId = product._id as Types.ObjectId;
            factoryPrice = product.factoryPrice;
          }
        }

        return {
          productId,
          sku: raw.sku,
          name: raw.name,
          weightJin: raw.weightJin,
          unitWeightG: raw.unitWeightG,
          qtyDeclared: raw.qtyDeclared,
          qtyCalculated,
          qtyFinal,
          quantitySource: raw.qtyDeclared != null ? QuantitySource.Declared : QuantitySource.Calculated,
          hasQuantityDiff: diff,
          factoryPrice,
          amount: qtyFinal * factoryPrice,
          remark: diff
            ? `系统提示：单据数量 ${raw.qtyDeclared} 与系统计算数量 ${qtyCalculated} 存在差异`
            : undefined,
        };
      }),
    );

    record.factoryId = factoryId;
    record.needFactorySelect = needFactorySelect;
    record.inboundDate = inboundDate;
    record.ocrRawResult = ocrResult as unknown as Record<string, unknown>;
    record.items = items as InboundRecord['items'];
    record.status = InboundStatus.PendingConfirm;
    await record.save();

    return record;
  }

  /**
   * 手工录入：不走 OCR，直接建一条空记录（没有图片），跳到跟识别单据一样的确认页去填。
   * 复用同一个确认页/同一套 confirm 接口，人工录入和识别出来的单据最后走的是同一条路。
   */
  async createManual() {
    return this.createWithGeneratedCode((code) => ({
      code,
      factoryId: null,
      needFactorySelect: true,
      inboundDate: new Date(),
      imageUrl: '',
      ocrRawResult: null,
      status: InboundStatus.PendingConfirm,
      items: [],
    }));
  }

  /** 人工确认页提交：重新计算每行金额，状态流转到 completed */
  async confirm(id: string, dto: ConfirmInboundDto) {
    const record = await this.getOrThrow(id);

    if (!dto.force) {
      const conflictCodes = await this.findDuplicateItemCodes(dto, id);
      if (conflictCodes.length) {
        throw new ConflictException({
          message: `同一天、同一个货号、同样的数量，在入库单「${conflictCodes.join('、')}」里已经录过了，是不是重复录入了？`,
          duplicateType: 'item',
          conflictCodes,
        } satisfies DuplicateConflictResponse);
      }
    }

    record.factoryId = new Types.ObjectId(dto.factoryId);
    record.needFactorySelect = false;
    record.inboundDate = new Date(dto.inboundDate);
    record.items = dto.items.map((item) => {
      const qtyCalculated = calculateQuantity(item.weightJin, item.unitWeightG);
      const qtyFinal = item.quantitySource === QuantitySource.Declared
        ? (item.qtyDeclared ?? qtyCalculated)
        : qtyCalculated;
      return {
        productId: item.productId ? new Types.ObjectId(item.productId) : null,
        sku: item.sku,
        name: item.name,
        weightJin: item.weightJin,
        unitWeightG: item.unitWeightG,
        qtyDeclared: item.qtyDeclared ?? null,
        qtyCalculated,
        qtyFinal,
        quantitySource: item.quantitySource,
        hasQuantityDiff: hasQuantityDiff(item.qtyDeclared, qtyCalculated),
        factoryPrice: item.factoryPrice,
        amount: qtyFinal * item.factoryPrice,
        remark: item.remark,
      };
    }) as InboundRecord['items'];
    record.status = InboundStatus.Completed;

    await record.save();
    return record;
  }

  /**
   * 修改已完成的入库单：直接改字段并重算金额。
   * 应收账单是对 inboundRecords 的实时聚合查询，这里存完即代表账单"同步"完成，
   * 不需要额外触发同步逻辑。
   */
  async update(id: string, dto: ConfirmInboundDto) {
    return this.confirm(id, dto);
  }

  /**
   * 列表按货号拆开、一行一个货号地展示（跟前端表格的粒度一致），筛选/分页也是按这个粒度
   * 来的——货号、金额这些条件本来就是针对某一行的，不是针对整条入库单的。金额还是实时
   * 算出来的（见 withLivePrices），没法直接拿 Mongo 查询过滤，所以这里是先按玩具厂/
   * 入库单号/日期这些"整单"条件圈一批记录出来，再在内存里拆行、按货号/产品名称/金额
   * 这些"单行"条件筛一遍，最后再分页。数据量不大（单用户内部工具），这样做没有性能问题。
   */
  async findAll(query: SearchInboundDto) {
    const filter: FilterQuery<InboundRecord> = {};
    if (query.factoryId) filter.factoryId = new Types.ObjectId(query.factoryId);
    if (query.code) filter.code = new RegExp(escapeRegExp(query.code), 'i');
    if (query.dateFrom || query.dateTo) {
      filter.inboundDate = {};
      if (query.dateFrom) filter.inboundDate.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.inboundDate.$lte = new Date(query.dateTo);
    }

    const records = await this.inboundModel.find(filter).sort({ inboundDate: -1, createdAt: -1 });
    const priced = await this.withLivePrices(records);

    let rows: InboundListRow[] = priced.flatMap((record) => {
      const items = record.items.length ? record.items : [null];
      return items.map((item) => ({
        recordId: record.id,
        code: record.code,
        factoryId: record.factoryId ? String(record.factoryId) : null,
        needFactorySelect: record.needFactorySelect,
        inboundDate: record.inboundDate,
        status: record.status,
        sku: item?.sku ?? null,
        name: item?.name ?? null,
        weightJin: item?.weightJin ?? null,
        unitWeightG: item?.unitWeightG ?? null,
        qtyFinal: item?.qtyFinal ?? null,
        factoryPrice: item?.factoryPrice ?? null,
        amount: item?.amount ?? null,
      }));
    });

    if (query.sku) rows = rows.filter((r) => r.sku === query.sku);
    if (query.productName) {
      const re = new RegExp(escapeRegExp(query.productName), 'i');
      rows = rows.filter((r) => r.name && re.test(r.name));
    }
    if (query.amountMin != null) rows = rows.filter((r) => r.amount != null && r.amount >= query.amountMin!);
    if (query.amountMax != null) rows = rows.filter((r) => r.amount != null && r.amount <= query.amountMax!);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const total = rows.length;
    const list = rows.slice((page - 1) * pageSize, page * pageSize);

    return { list, total, page, pageSize };
  }

  /**
   * 入库单列表里的金额跟应收账单一样，不用入库确认时存死的工厂价快照，改成实时读
   * 产品档案当前的价格——不然产品价格是后来才补录/改的，这个列表看着金额还是 0，
   * 跟应收账单那边（已经是实时读取）对不上，容易让人以为是账单算错了。只是展示层面
   * 覆盖一下，不改数据库里存的历史快照。
   */
  private async withLivePrices(records: InboundRecord[]) {
    const factoryIds = [...new Set(records.map((r) => r.factoryId).filter(Boolean).map(String))];
    const priceMaps = new Map<string, Map<string, number>>();
    await Promise.all(
      factoryIds.map(async (factoryId) => {
        const products = await this.productService.findByFactory(factoryId);
        priceMaps.set(factoryId, new Map(products.map((p) => [p.sku, p.factoryPrice])));
      }),
    );

    return records.map((record) => {
      // 用 toJSON() 不用 toObject()：toJSON 才会走 idTransformPlugin 那个全局转换
      // （_id → id 字符串、去掉 __v），toObject 拿到的是原始 Mongoose 内部结构，
      // 前端认的是 id，用错方法这里会悄悄把整个列表的 id 字段丢没
      const plain = record.toJSON();
      const priceMap = record.factoryId ? priceMaps.get(String(record.factoryId)) : undefined;
      plain.items = plain.items.map((item) => {
        const livePrice = priceMap?.get(item.sku);
        if (livePrice === undefined) return item;
        return { ...item, factoryPrice: livePrice, amount: item.qtyFinal * livePrice };
      });
      return plain;
    });
  }

  async findOne(id: string) {
    return this.getOrThrow(id);
  }

  async remove(id: string) {
    const record = await this.inboundModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('入库单不存在');
    return { success: true };
  }

  /**
   * 旋转入库单图片：直接把磁盘上的原图文件旋转后覆写保存，imageUrl 不变。
   * 这样"旋转之后要保存，下次查看就是旋转之后的"是天然成立的——不是前端 CSS 转一下就完了，
   * 存的就是转正之后的图。updatedAt 会跟着 save() 自动刷新，前端拿它当版本号给图片 URL 加 query
   * 做缓存清除用。
   */
  /**
   * 旋转入库单图片：只改一个存在 InboundRecord 上的角度字段（0/90/180/270），原图文件的
   * 字节从头到尾都不会被碰。之前是拿 Jimp 把整张图解码、转、重新编码存盘，图片是有损格式，
   * 转的次数一多画质会肉眼可见地劣化；现在只是数据库里一个数字自增/自减，没有图片处理，
   * 也就没有画质损失这回事，转多少次都一样清晰。
   *
   * 显示的时候前端拿这个角度值给 <img> 套一个 CSS rotate() 就行，见 InboundConfirmView.vue。
   */
  async rotateImage(id: string, direction: 'left' | 'right') {
    const record = await this.getOrThrow(id);
    const delta = direction === 'right' ? 90 : -90;
    record.rotation = ((record.rotation + delta) % 360 + 360) % 360;
    await record.save();
    return record;
  }

  /**
   * 供确认页在录入过程中实时提醒用的：不落库、只查，跟 confirm() 里拦截用的是同一份判断逻辑。
   * excludeId 传当前这条正在编辑/确认的记录 id，避免跟自己撞上。
   */
  async checkDuplicates(id: string, dto: Pick<ConfirmInboundDto, 'factoryId' | 'inboundDate' | 'items'>) {
    if (!dto.factoryId || !dto.inboundDate || !dto.items?.length) return { conflictCodes: [] };
    return { conflictCodes: await this.findDuplicateItemCodes(dto, id) };
  }

  /**
   * 同一个玩具厂、同一天、同一个货号、同样的数量——很可能是同一批货被重复录入了
   * （比如单据识别了两次，或者手工录入的时候把已经录过的又录了一遍）。不比对克重：
   * 同一张单据重新识别一次，OCR 认出来的单个克重经常会有细微差异，但单据上人工写的
   * 数量是死的、最稳定，拿数量 + 货号来判断更准。只跟"已完成"的记录比，正在识别中/
   * 待确认的不算数；排除自己这条，不然编辑已完成的单据保存一次就会跟自己撞上。
   */
  private async findDuplicateItemCodes(
    dto: Pick<ConfirmInboundDto, 'factoryId' | 'inboundDate' | 'items'>,
    excludeId: string,
  ): Promise<string[]> {
    const { start, end } = dayRange(dto.inboundDate);
    const candidates = await this.inboundModel.find({
      _id: { $ne: excludeId },
      factoryId: new Types.ObjectId(dto.factoryId),
      status: InboundStatus.Completed,
      inboundDate: { $gte: start, $lt: end },
    });

    const dtoFinalQtys = dto.items.map((item) => ({
      sku: item.sku,
      qtyFinal:
        item.quantitySource === QuantitySource.Declared
          ? (item.qtyDeclared ?? calculateQuantity(item.weightJin, item.unitWeightG))
          : calculateQuantity(item.weightJin, item.unitWeightG),
    }));

    const codes = new Set<string>();
    for (const candidate of candidates) {
      const hit = candidate.items.some((existingItem) =>
        dtoFinalQtys.some((item) => item.sku === existingItem.sku && item.qtyFinal === existingItem.qtyFinal),
      );
      if (hit) codes.add(candidate.code);
    }
    return [...codes];
  }

  private async getOrThrow(id: string) {
    const record = await this.inboundModel.findById(id);
    if (!record) throw new NotFoundException('入库单不存在');
    return record;
  }

  /**
   * 生成入库单号 + 建记录：即使 generateCode() 万一还是跟并发的另一次请求撞了号
   * （唯一索引兜底拦下来），这里再重试几次换个新号，不会直接 500 给用户看
   */
  private async createWithGeneratedCode(buildDoc: (code: string) => AnyKeys<InboundRecord>) {
    for (let attempt = 0; ; attempt++) {
      const code = await this.generateCode();
      try {
        return await this.inboundModel.create(buildDoc(code));
      } catch (err) {
        const isDuplicateCode = (err as { code?: number }).code === 11000;
        if (!isDuplicateCode || attempt >= 2) throw err;
      }
    }
  }

  /**
   * 入库单号：RK + 当天日期 + 3位当天序号，如 RK20260821001。
   *
   * 之前用的是"今天已经有多少条记录"（countDocuments）来算下一个序号——只要今天有任意一条
   * 记录被删过（这次开发过程里删过很多测试数据），"现在还剩多少条"就会比"今天总共编到多少号"
   * 小，算出来的新编号会跟一个还存在的旧记录撞上，MongoDB 唯一索引直接拒绝插入，抛 500。
   * 改成找当天已经用到的最大序号、在此基础上 +1，不受删除影响；同时保留 unique 索引本身作为
   * 最后一道防线，真撞上了就重试一次换下一个号，双重保险。
   */
  private async generateCode(): Promise<string> {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const prefix = `RK${y}${m}${d}`;

    const todayRecords = await this.inboundModel
      .find({ code: new RegExp(`^${prefix}\\d{3}$`) }, { code: 1 })
      .sort({ code: -1 })
      .limit(1);

    const maxSeq = todayRecords.length ? Number(todayRecords[0].code.slice(-3)) : 0;
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** OCR 识别出来的日期是否靠谱：不是非法日期，年份也没有离今天太远（未来超过 30 天，
 * 或者超过 5 年前）。入库单一般是当天或者近几天补录的，不会是几年前/几年后的单据 */
function isPlausibleDate(date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  const maxFuture = new Date(now);
  maxFuture.setDate(maxFuture.getDate() + 30);
  const minPast = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
  return date <= maxFuture && date >= minPast;
}

/** 某一天的 [00:00, 次日00:00) 区间，用于按天比对是不是"同一天"入库的 */
function dayRange(dateStr: string) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return { start, end };
}
