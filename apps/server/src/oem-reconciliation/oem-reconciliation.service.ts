import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialIssuance } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt } from '../oem-receipt/schemas/oem-receipt.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { Material } from '../material/schemas/material.schema';
import { Product } from '../product/schemas/product.schema';

@Injectable()
export class OemReconciliationService {
  constructor(
    @InjectModel(MaterialIssuance.name) private readonly issuanceModel: Model<MaterialIssuance>,
    @InjectModel(OemReceipt.name) private readonly receiptModel: Model<OemReceipt>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(Material.name) private readonly materialModel: Model<Material>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /**
   * 按"代工厂 + 物料"两两配对，算已发-应耗-结余：
   * 已发 = 这个代工厂所有发料记录里这种物料的数量之和；
   * 应耗 = 这个代工厂所有成品回收记录，按对应产品的工序配方（同一物料跨多道工序的用量要
   * 累加），乘以回收数量，再按物料汇总；
   * 结余 = 已发 - 应耗，正常应该 >= 0，明显偏离说明物料去向对不上账，需要人工核查。
   */
  async getReconciliation() {
    const [issuances, receipts, oemFactories, materials, products] = await Promise.all([
      this.issuanceModel.find().lean(),
      this.receiptModel.find().lean(),
      this.oemFactoryModel.find().lean(),
      this.materialModel.find().lean(),
      this.productModel.find().lean(),
    ]);

    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const materialMap = new Map(materials.map((m) => [String(m._id), m]));
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    // key: `${oemFactoryId}|${materialId}`
    const issuedMap = new Map<string, number>();
    for (const issuance of issuances) {
      const key = `${issuance.oemFactoryId}|${issuance.materialId}`;
      issuedMap.set(key, (issuedMap.get(key) ?? 0) + issuance.qty);
    }

    const consumedMap = new Map<string, number>();
    for (const receipt of receipts) {
      const product = productMap.get(String(receipt.productId));
      if (!product) continue;
      // 同一物料可能出现在这个产品的好几道工序里，先按物料把每单位产品的用量加总，
      // 再乘以这批回收的数量——不能只看某一道工序，不然会漏算
      const perUnitByMaterial = new Map<string, number>();
      for (const step of product.processes ?? []) {
        for (const usage of step.materials ?? []) {
          const materialId = String(usage.materialId);
          perUnitByMaterial.set(materialId, (perUnitByMaterial.get(materialId) ?? 0) + usage.qty);
        }
      }
      for (const [materialId, perUnitQty] of perUnitByMaterial) {
        const key = `${receipt.oemFactoryId}|${materialId}`;
        consumedMap.set(key, (consumedMap.get(key) ?? 0) + perUnitQty * receipt.qty);
      }
    }

    const allKeys = new Set([...issuedMap.keys(), ...consumedMap.keys()]);
    return [...allKeys].map((key) => {
      const [oemFactoryId, materialId] = key.split('|');
      const material = materialMap.get(materialId);
      const issuedQty = issuedMap.get(key) ?? 0;
      const consumedQty = consumedMap.get(key) ?? 0;
      return {
        oemFactoryId,
        oemFactoryName: factoryNameMap.get(oemFactoryId) ?? '未知代工厂',
        materialId,
        materialName: material?.name ?? '未知物料',
        unit: material?.unit ?? '',
        issuedQty,
        consumedQty,
        balanceQty: issuedQty - consumedQty,
      };
    });
  }
}
