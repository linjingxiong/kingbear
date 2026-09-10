import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialIssuance } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt } from '../oem-receipt/schemas/oem-receipt.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';
import { Product } from '../product/schemas/product.schema';
import { CommonMaterial } from '../common-material/schemas/common-material.schema';
import { CommonMaterialReturn } from '../common-material-return/schemas/common-material-return.schema';

export interface MaterialReconciliationRow {
  kind: 'product' | 'common';
  oemFactoryId: string;
  oemFactoryName: string;
  productGroupId: string;
  productGroupName: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  consumedQty: number;
  returnedQty: number;
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
    @InjectModel(CommonMaterial.name) private readonly commonMaterialModel: Model<CommonMaterial>,
    @InjectModel(CommonMaterialReturn.name) private readonly returnModel: Model<CommonMaterialReturn>,
  ) {}

  async getReconciliation(): Promise<MaterialReconciliationRow[]> {
    const [issuances, receipts, oemFactories, productGroups, products, commonMaterials, returns] = await Promise.all([
      this.issuanceModel.find().lean(),
      this.receiptModel.find().lean(),
      this.oemFactoryModel.find().lean(),
      this.productGroupModel.find().lean(),
      this.productModel.find().lean(),
      this.commonMaterialModel.find().lean(),
      this.returnModel.find().lean(),
    ]);

    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const groupMap = new Map(productGroups.map((g) => [String(g._id), g]));
    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const commonUnitMap = new Map(commonMaterials.map((m) => [m.name, m.unit]));

    // ---- 产品物料：结余 = 已发 - 应耗 ----
    // key: `${oemFactoryId}|${productGroupId}|${materialName}`
    const prodIssued = new Map<string, number>();
    for (const it of issuances) {
      if (!it.productGroupId) continue;
      const key = `${it.oemFactoryId}|${it.productGroupId}|${it.materialName}`;
      prodIssued.set(key, (prodIssued.get(key) ?? 0) + it.qty);
    }
    const prodConsumed = new Map<string, number>();
    for (const receipt of receipts) {
      const product = productMap.get(String(receipt.productId));
      if (!product || !product.productGroupId) continue;
      const groupId = String(product.productGroupId);
      const perUnit = new Map<string, number>();
      for (const usage of product.materials ?? []) {
        perUnit.set(usage.materialName, (perUnit.get(usage.materialName) ?? 0) + usage.qty);
      }
      for (const [materialName, perUnitQty] of perUnit) {
        const key = `${receipt.oemFactoryId}|${groupId}|${materialName}`;
        prodConsumed.set(key, (prodConsumed.get(key) ?? 0) + perUnitQty * receipt.qty);
      }
    }
    const prodRows: MaterialReconciliationRow[] = [];
    for (const key of new Set([...prodIssued.keys(), ...prodConsumed.keys()])) {
      const [oemFactoryId, productGroupId, materialName] = key.split('|');
      const group = groupMap.get(productGroupId);
      const issuedQty = prodIssued.get(key) ?? 0;
      const consumedQty = prodConsumed.get(key) ?? 0;
      prodRows.push({
        kind: 'product',
        oemFactoryId,
        oemFactoryName: factoryNameMap.get(oemFactoryId) ?? '未知代工厂',
        productGroupId,
        productGroupName: group?.name ?? '未知产品',
        materialName,
        unit: group?.materials?.find((m) => m.name === materialName)?.unit ?? '',
        issuedQty,
        consumedQty,
        returnedQty: 0,
        balanceQty: issuedQty - consumedQty,
      });
    }

    // ---- 通用物料（框等）：结余 = 已发 - 已回收 ----
    // key: `${oemFactoryId}|${materialName}`
    const commonIssued = new Map<string, number>();
    for (const it of issuances) {
      if (it.productGroupId) continue;
      const key = `${it.oemFactoryId}|${it.materialName}`;
      commonIssued.set(key, (commonIssued.get(key) ?? 0) + it.qty);
    }
    const commonReturned = new Map<string, number>();
    for (const r of returns) {
      const key = `${r.oemFactoryId}|${r.commonMaterialName}`;
      commonReturned.set(key, (commonReturned.get(key) ?? 0) + r.qty);
    }
    const commonRows: MaterialReconciliationRow[] = [];
    for (const key of new Set([...commonIssued.keys(), ...commonReturned.keys()])) {
      const [oemFactoryId, materialName] = key.split('|');
      const issuedQty = commonIssued.get(key) ?? 0;
      const returnedQty = commonReturned.get(key) ?? 0;
      commonRows.push({
        kind: 'common',
        oemFactoryId,
        oemFactoryName: factoryNameMap.get(oemFactoryId) ?? '未知代工厂',
        productGroupId: '',
        productGroupName: '通用物料',
        materialName,
        unit: commonUnitMap.get(materialName) ?? '',
        issuedQty,
        consumedQty: 0,
        returnedQty,
        balanceQty: issuedQty - returnedQty,
      });
    }

    return [...prodRows, ...commonRows];
  }
}
