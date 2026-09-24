import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboundReturn } from './schemas/inbound-return.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { OCR_PROVIDER } from '../ocr/ocr.module';
import type { OcrProvider } from '../ocr/ocr.types';
import { CreateInboundReturnDto } from './dto/create-inbound-return.dto';
import { UpdateInboundReturnDto } from './dto/update-inbound-return.dto';

// findAll() 用 .lean() 拼接聚合结果，交给 TS 自动推断会因为引用到 mongodb 内部类型而报
// "inferred type cannot be named"，这里手动给个显式类型（跟 factory.service 同样的坑）
export interface InboundReturnListItem {
  id: string;
  kind: 'issue' | 'return';
  factoryId: string;
  productId: string | null;
  sku: string;
  name: string;
  materialName?: string;
  weightJin: number;
  unitWeightG: number;
  qtyDeclared: number | null;
  qty: number;
  factoryPrice: number;
  amount: number;
  returnDate: Date;
  reason: string;
  images: string[];
  rotation: number;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
  factoryName: string;
}

@Injectable()
export class InboundReturnService {
  constructor(
    @InjectModel(InboundReturn.name) private readonly returnModel: Model<InboundReturn>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  /** 工厂价不信前端传的那个数，实时查一下产品档案当前的价格再算金额——跟账单页
   * "改了产品价格不用回来改历史记录"是同一个原则；查不到产品（没选货号/被删了）
   * 才退回用调用方给的价格兜底 */
  private async resolveFactoryPrice(productId: string | null | undefined, fallback = 0): Promise<number> {
    if (productId) {
      const product = await this.productModel.findById(productId).lean();
      if (product) return product.factoryPrice;
    }
    return fallback;
  }

  async create(dto: CreateInboundReturnDto) {
    const factoryPrice = await this.resolveFactoryPrice(dto.productId, dto.factoryPrice ?? 0);
    return this.returnModel.create({ ...dto, factoryPrice, amount: dto.qty * factoryPrice });
  }

  /** 退货单跟入库单长得一样（货号/名称/重量/克重/数量），直接复用入库单的识别，
   * 只返回识别结果，不建记录 */
  recognize(imagePath: string) {
    return this.ocr.recognizeInboundImage(imagePath);
  }

  /** 发料单识别的是原材料（物料名称 + 重量），跟退货完全不同的识别模板，只返回识别结果，不建记录 */
  recognizeIssue(imagePath: string) {
    return this.ocr.recognizeOutboundIssueImage(imagePath);
  }

  /** 列表带上玩具厂名称——前端列表页要用到人能看懂的名字，不是裸 id */
  async findAll(): Promise<InboundReturnListItem[]> {
    const list = await this.returnModel.find().sort({ returnDate: -1, createdAt: -1 }).lean();
    const factories = await this.factoryModel.find().lean();
    const factoryNameMap = new Map(factories.map((f) => [String(f._id), f.name]));

    // .lean() 不会套 schema 的 default，老记录没有 kind 字段，这里手动补成 "return"
    return list.map(({ _id, __v, factoryId, productId, kind, ...rest }) => ({
      ...rest,
      id: String(_id),
      kind: kind ?? 'return',
      factoryId: String(factoryId),
      productId: productId ? String(productId) : null,
      factoryName: factoryNameMap.get(String(factoryId)) ?? '未知玩具厂',
    }));
  }

  async findOne(id: string) {
    const record = await this.returnModel.findById(id);
    if (!record) throw new NotFoundException('退货记录不存在');
    return record;
  }

  async update(id: string, dto: UpdateInboundReturnDto) {
    const existing = await this.returnModel.findById(id);
    if (!existing) throw new NotFoundException('退货记录不存在');

    const productId = dto.productId !== undefined ? dto.productId : (existing.productId ? String(existing.productId) : null);
    const qty = dto.qty ?? existing.qty;
    const factoryPrice = await this.resolveFactoryPrice(productId, dto.factoryPrice ?? existing.factoryPrice);

    const record = await this.returnModel.findByIdAndUpdate(id, { ...dto, factoryPrice, amount: qty * factoryPrice }, { new: true });
    if (!record) throw new NotFoundException('退货记录不存在');
    return record;
  }

  async remove(id: string) {
    const record = await this.returnModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('退货记录不存在');
    return { success: true };
  }
}
