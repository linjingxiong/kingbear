/**
 * 物料对账：某个代工厂、某个产品、某种物料的"已发-应耗-结余"。
 * 应耗 = 这个代工厂这个产品下每条成品回收记录，按对应工序配方里该物料的用量 × 回收数量之和；
 * 结余 = 已发 - 应耗，正常应该 >= 0，明显偏离（尤其负数）说明物料去向对不上账。
 */
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
