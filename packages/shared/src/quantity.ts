/**
 * 入库数量计算公式：数量 = 重量(斤) × 500 ÷ 单个克重(g)
 * 例：100斤，单个50g → 100×500÷50 = 1000个
 *
 * 前端（入库确认页、入库管理列表）和后端都从这一份算，保证"差多少算差异较大"
 * 这件事全系统只有一个标准，不会出现前端拦一次、后端存的时候又用另一套判断的情况。
 */
export function calculateQuantity(weightJin: number, unitWeightG: number): number {
  if (!unitWeightG || unitWeightG <= 0) return 0;
  return Math.round((weightJin * 500) / unitWeightG);
}

/** 相差超过这个比例就认为差异很大，很可能是录入的时候敲错了数字 */
export const BIG_QTY_DIFF_RATIO = 0.01;

/** 数量与按重量算出来的数量之间的相对差异；calculated 为 0（比如克重没填）时没法算比例，
 * 只要 qty 不是 0 就直接判定为"有问题" */
export function qtyDiffRatio(qty: number, calculated: number): number {
  if (!calculated) return qty > 0 ? Infinity : 0;
  return Math.abs(qty - calculated) / calculated;
}

export function hasBigQuantityDiff(qty: number, calculated: number): boolean {
  return qtyDiffRatio(qty, calculated) > BIG_QTY_DIFF_RATIO;
}
