import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { InboundStatus, QuantitySource } from '@kingbear/shared';
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

  /** 上传图片后：存图 → 建 processing 记录 → 调 OCR → 后处理 → 落成 pending_confirm */
  async createFromUpload(imageUrl: string, imageFilePath: string) {
    const code = await this.generateCode();

    const record = await this.inboundModel.create({
      code,
      factoryId: null,
      needFactorySelect: true,
      inboundDate: new Date(),
      imageUrl,
      ocrRawResult: null,
      status: InboundStatus.Processing,
      items: [],
    });

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

    // 日期识别失败 → 默认当天
    const inboundDate = ocrResult.date ? new Date(ocrResult.date) : new Date();

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

  /** 人工确认页提交：重新计算每行金额，状态流转到 completed */
  async confirm(id: string, dto: ConfirmInboundDto) {
    const record = await this.getOrThrow(id);

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

  async findAll(query: SearchInboundDto) {
    const filter: FilterQuery<InboundRecord> = {};
    if (query.factoryId) filter.factoryId = new Types.ObjectId(query.factoryId);
    if (query.code) filter.code = new RegExp(escapeRegExp(query.code), 'i');
    if (query.dateFrom || query.dateTo) {
      filter.inboundDate = {};
      if (query.dateFrom) filter.inboundDate.$gte = new Date(query.dateFrom);
      if (query.dateTo) filter.inboundDate.$lte = new Date(query.dateTo);
    }
    if (query.productName) filter['items.name'] = new RegExp(escapeRegExp(query.productName), 'i');
    if (query.sku) filter['items.sku'] = new RegExp(escapeRegExp(query.sku), 'i');

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [list, total] = await Promise.all([
      this.inboundModel
        .find(filter)
        .sort({ inboundDate: -1, createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize),
      this.inboundModel.countDocuments(filter),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: string) {
    return this.getOrThrow(id);
  }

  async remove(id: string) {
    const record = await this.inboundModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('入库单不存在');
    return { success: true };
  }

  private async getOrThrow(id: string) {
    const record = await this.inboundModel.findById(id);
    if (!record) throw new NotFoundException('入库单不存在');
    return record;
  }

  /** 入库单号：RK + 当天日期 + 3位当天序号，如 RK20260821001 */
  private async generateCode() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const prefix = `RK${y}${m}${d}`;

    const start = new Date(y, today.getMonth(), today.getDate());
    const end = new Date(y, today.getMonth(), today.getDate() + 1);
    const countToday = await this.inboundModel.countDocuments({
      createdAt: { $gte: start, $lt: end },
    });

    return `${prefix}${String(countToday + 1).padStart(3, '0')}`;
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
