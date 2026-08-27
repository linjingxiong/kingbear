/**
 * 入库数量计算公式：数量 = 重量(斤) × 500 ÷ 单个克重(g)
 * 例：100斤，单个50g → 100×500÷50 = 1000个
 *
 * 前端（入库确认页、入库管理列表、应收账单）和后端都从这一份算，保证"差多少算差异较大"
 * 这件事全系统只有一个标准，不会出现前端拦一次、后端存的时候又用另一套判断的情况。
 */
export function calculateQuantity(weightJin: number, unitWeightG: number): number {
  if (!unitWeightG || unitWeightG <= 0) return 0;
  return Math.round((weightJin * 500) / unitWeightG);
}

/**
 * 相差超过这个"个数"就认为差异很大，很可能是录入的时候敲错了数字。
 * 用的是绝对值差（不是比例）：数量越大，比例上的误差容忍度反而越松，但实际业务里
 * 差 5 个以内基本都是称重/计数的正常误差，不管数量是几十个还是几万个，标准都一样。
 */
export const BIG_QTY_DIFF_ABS = 5;

export function qtyDiff(qty: number, calculated: number): number {
  return Math.abs(qty - calculated);
}

export function hasBigQuantityDiff(qty: number, calculated: number): boolean {
  return qtyDiff(qty, calculated) > BIG_QTY_DIFF_ABS;
}
