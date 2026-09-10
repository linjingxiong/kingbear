/**
 * 物料对账：某个代工厂、某种物料的"已发-应耗-结余"。
 * 应耗 = 这个代工厂每条成品回收记录，按对应产品的工序配方算出来的物料消耗量之和；
 * 结余 = 已发 - 应耗，正常应该 >= 0，明显偏离（尤其是负数）说明物料去向对不上账。
 */
export interface MaterialReconciliationRow {
  oemFactoryId: string;
  oemFactoryName: string;
  materialId: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  consumedQty: number;
  balanceQty: number;
}
