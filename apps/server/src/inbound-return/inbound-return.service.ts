import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { InboundReturn } from './schemas/inbound-return.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { OCR_PROVIDER } from '../ocr/ocr.module';
import type { OcrProvider } from '../ocr/ocr.types';
import { CreateInboundReturnDto } from './dto/create-inbound-return.dto';
import { UpdateInboundReturnDto } from './dto/update-inbound-return.dto';

// findAll() 用 .lean() 拼接聚合结果，交给 TS 自动推断会因为引用到 mongodb 内部类型而报
// "inferred type cannot be named"，这里手动给个显式类型（跟 factory.service 同样的坑）
export interface InboundReturnListItem {
  id: string;
  factoryId: string;
  productId: string | null;
  sku: string;
  name: string;
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
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  create(dto: CreateInboundReturnDto) {
    return this.returnModel.create(dto);
  }

  /** 退货单跟入库单长得一样（货号/名称/重量/克重/数量），直接复用入库单的识别，
   * 只返回识别结果，不建记录 */
  recognize(imagePath: string) {
    return this.ocr.recognizeInboundImage(imagePath);
  }

  /** 列表带上玩具厂名称——前端列表页要用到人能看懂的名字，不是裸 id */
  async findAll(): Promise<InboundReturnListItem[]> {
    const list = await this.returnModel.find().sort({ returnDate: -1, createdAt: -1 }).lean();
    const factories = await this.factoryModel.find().lean();
    const factoryNameMap = new Map(factories.map((f) => [String(f._id), f.name]));

    return list.map(({ _id, __v, factoryId, productId, ...rest }) => ({
      ...rest,
      id: String(_id),
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
    const record = await this.returnModel.findByIdAndUpdate(id, dto, { new: true });
    if (!record) throw new NotFoundException('退货记录不存在');
    return record;
  }

  async remove(id: string) {
    const record = await this.returnModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('退货记录不存在');
    return { success: true };
  }
}
