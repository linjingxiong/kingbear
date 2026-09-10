/**
 * 物料对账。两种：
 * - 产品物料（kind='product'）：结余 = 已发 - 应耗。应耗 = 该产品下每条成品回收记录按对应
 *   工序配方算出来的消耗量之和。
 * - 通用物料（kind='common'，比如"框"）：不消耗，结余 = 已发 - 已回收。
 * 结余明显偏离（尤其负数）说明物料/框去向对不上账。
 */
export interface MaterialReconciliationRow {
  kind: "product" | "common";
  oemFactoryId: string;
  oemFactoryName: string;
  /** 通用物料没有所属产品，为空 */
  productGroupId: string;
  productGroupName: string;
  materialName: string;
  unit: string;
  issuedQty: number;
  /** 只有产品物料有意义 */
  consumedQty: number;
  /** 只有通用物料有意义 */
  returnedQty: number;
  balanceQty: number;
}
