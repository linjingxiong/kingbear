import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OemReceipt } from './schemas/oem-receipt.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { Product } from '../product/schemas/product.schema';
import { OCR_PROVIDER } from '../ocr/ocr.module';
import type { OcrProvider } from '../ocr/ocr.types';
import { CreateOemReceiptDto } from './dto/create-oem-receipt.dto';
import { UpdateOemReceiptDto } from './dto/update-oem-receipt.dto';

// findAll() 用 .lean() 拼接聚合结果，交给 TS 自动推断会因为引用到 mongodb 内部类型而报
// "inferred type cannot be named" / 超出可序列化长度，这里手动给个显式类型（跟 factory.service 同样的坑）
export interface OemReceiptListItem {
  id: string;
  oemFactoryId: string;
  productId: string;
  weightJin: number;
  unitWeightG: number;
  qtyDeclared: number | null;
  qty: number;
  receivedDate: Date;
  images: string[];
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
  oemFactoryName: string;
  productSku: string;
  productName: string;
}

@Injectable()
export class OemReceiptService {
  constructor(
    @InjectModel(OemReceipt.name) private readonly receiptModel: Model<OemReceipt>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @Inject(OCR_PROVIDER) private readonly ocr: OcrProvider,
  ) {}

  create(dto: CreateOemReceiptDto) {
    return this.receiptModel.create(dto);
  }

  /** 回收单图片 OCR 识别，只返回识别结果，不建记录 */
  recognize(imagePath: string) {
    return this.ocr.recognizeOemReceiptImage(imagePath);
  }

  /** 列表带上代工厂/产品名称——前端列表页、物料对账都要用到人能看懂的名字，不是裸 id */
  async findAll(): Promise<OemReceiptListItem[]> {
    const list = await this.receiptModel.find().sort({ receivedDate: -1, createdAt: -1 }).lean();
    const [oemFactories, products] = await Promise.all([this.oemFactoryModel.find().lean(), this.productModel.find().lean()]);
    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    return list.map(({ _id, __v, oemFactoryId, productId, ...rest }) => {
      const product = productMap.get(String(productId));
      return {
        ...rest,
        id: String(_id),
        oemFactoryId: String(oemFactoryId),
        productId: String(productId),
        oemFactoryName: factoryNameMap.get(String(oemFactoryId)) ?? '未知代工厂',
        productSku: product?.sku ?? '未知货号',
        productName: product?.name ?? '未知产品',
      };
    });
  }

  async findOne(id: string) {
    const record = await this.receiptModel.findById(id);
    if (!record) throw new NotFoundException('回收记录不存在');
    return record;
  }

  async update(id: string, dto: UpdateOemReceiptDto) {
    const record = await this.receiptModel.findByIdAndUpdate(id, dto, { new: true });
    if (!record) throw new NotFoundException('回收记录不存在');
    return record;
  }

  async remove(id: string) {
    const record = await this.receiptModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('回收记录不存在');
    return { success: true };
  }
}
