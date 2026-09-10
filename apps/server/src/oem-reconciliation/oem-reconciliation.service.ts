import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialIssuance } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt } from '../oem-receipt/schemas/oem-receipt.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';
import { Product } from '../product/schemas/product.schema';

export interface MaterialReconciliationRow {
  oemFactoryId: string;
  oemFactoryName: string;
  productGroupId: string;
  productGroupName: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  consumedQty: number;
  balanceQty: number;
}

@Injectable()
export class OemReconciliationService {
  constructor(
    @InjectModel(MaterialIssuance.name) private readonly issuanceModel: Model<MaterialIssuance>,
    @InjectModel(OemReceipt.name) private readonly receiptModel: Model<OemReceipt>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(ProductGroup.name) private readonly productGroupModel: Model<ProductGroup>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /**
   * 按"代工厂 + 产品 + 物料名"三者配对，算已发-应耗-结余：
   * 已发 = 这个代工厂这个产品的这种物料，所有发料记录数量之和；
   * 应耗 = 这个代工厂、属于这个产品的每条成品回收记录（回收的是工序），按该工序配方里
   * 这种物料的用量 × 回收数量之和；
   * 结余 = 已发 - 应耗，正常应该 >= 0，明显偏离（尤其负数）说明物料去向对不上账。
   */
  async getReconciliation(): Promise<MaterialReconciliationRow[]> {
    const [issuances, receipts, oemFactories, productGroups, products] = await Promise.all([
      this.issuanceModel.find().lean(),
      this.receiptModel.find().lean(),
      this.oemFactoryModel.find().lean(),
      this.productGroupModel.find().lean(),
      this.productModel.find().lean(),
    ]);

    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const groupMap = new Map(productGroups.map((g) => [String(g._id), g]));
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    // key: `${oemFactoryId}|${productGroupId}|${materialName}`
    const issuedMap = new Map<string, number>();
    for (const issuance of issuances) {
      const key = `${issuance.oemFactoryId}|${issuance.productGroupId}|${issuance.materialName}`;
      issuedMap.set(key, (issuedMap.get(key) ?? 0) + issuance.qty);
    }

    const consumedMap = new Map<string, number>();
    for (const receipt of receipts) {
      const product = productMap.get(String(receipt.productId));
      if (!product || !product.productGroupId) continue;
      const groupId = String(product.productGroupId);
      const perUnitByMaterial = new Map<string, number>();
      for (const usage of product.materials ?? []) {
        perUnitByMaterial.set(usage.materialName, (perUnitByMaterial.get(usage.materialName) ?? 0) + usage.qty);
      }
      for (const [materialName, perUnitQty] of perUnitByMaterial) {
        const key = `${receipt.oemFactoryId}|${groupId}|${materialName}`;
        consumedMap.set(key, (consumedMap.get(key) ?? 0) + perUnitQty * receipt.qty);
      }
    }

    const allKeys = new Set([...issuedMap.keys(), ...consumedMap.keys()]);
    return [...allKeys].map((key) => {
      const [oemFactoryId, productGroupId, materialName] = key.split('|');
      const group = groupMap.get(productGroupId);
      const unit = group?.materials?.find((m) => m.name === materialName)?.unit ?? '';
      const issuedQty = issuedMap.get(key) ?? 0;
      const consumedQty = consumedMap.get(key) ?? 0;
      return {
        oemFactoryId,
        oemFactoryName: factoryNameMap.get(oemFactoryId) ?? '未知代工厂',
        productGroupId,
        productGroupName: group?.name ?? '未知产品',
        materialName,
        unit,
        issuedQty,
        consumedQty,
        balanceQty: issuedQty - consumedQty,
      };
    });
  }
}
