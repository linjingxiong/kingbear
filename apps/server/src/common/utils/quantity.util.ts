import { calculateQuantity, hasBigQuantityDiff } from '@kingbear/shared';

export { calculateQuantity };

/**
 * 单据填写数量与系统按重量算出来的数量是否存在"较大"差异（相差超过 5 个，见
 * @kingbear/shared 里的 BIG_QTY_DIFF_ABS）。跟前端入库确认页提交前的拦截用的
 * 是同一份判断逻辑，不会出现前后端标准不一致的情况。
 */
export function hasQuantityDiff(
  qtyDeclared: number | null | undefined,
  qtyCalculated: number,
): boolean {
  if (qtyDeclared === null || qtyDeclared === undefined) return false;
  return hasBigQuantityDiff(qtyDeclared, qtyCalculated);
}
