import { ElMessageBox } from "element-plus";
import type { DuplicateConflictResponse } from "@kingbear/shared";

/**
 * 提交单据遇到"疑似重复录入"（后端查到同一天、同样的货号/物料、同样的量，返回 409、
 * duplicateType === "item"）时，弹框让人工确认；确认了就打上 force 标记再提交一次，
 * 点"返回检查"就把原始错误重新抛出去，调用方该怎么处理错误就怎么处理，不会被这里吞掉。
 * 跟入库确认页（InboundConfirmView）是同一套交互，这里抽出来给其他几个"录入即创建"的
 * 单据页面（出库单/物料发放/成品回收/通用物料回收）复用，不用每页各写一遍。
 */
export async function submitWithDuplicateConfirm<T extends { force?: boolean }>(
  dto: T,
  submit: (dto: T) => Promise<unknown>,
): Promise<void> {
  try {
    await submit(dto);
  } catch (err) {
    const data = (err as { response?: { data?: DuplicateConflictResponse } }).response?.data;
    if (data?.duplicateType !== "item") throw err;
    await ElMessageBox.confirm(data.message, "疑似重复录入", {
      confirmButtonText: "确认按此提交",
      cancelButtonText: "返回检查",
      type: "warning",
    });
    await submit({ ...dto, force: true });
  }
}
