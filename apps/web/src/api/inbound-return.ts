import type {
  CreateInboundReturnDto,
  InboundReturnListItem,
  InboundReturnOcrResult,
  OutboundIssueOcrResult,
  UpdateInboundReturnDto,
} from "@kingbear/shared";
import request from "./request";

export function listInboundReturns() {
  return request.get<never, InboundReturnListItem[]>("/inbound-returns");
}

/** 上传退货单图片做 OCR 识别（货号/名称/重量/克重/数量），返回识别结果 + 图片 URL（不建记录） */
export function recognizeInboundReturn(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, InboundReturnOcrResult>("/inbound-returns/recognize", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** 上传发料单图片做 OCR 识别（物料名称+重量），发的是原材料，跟退货识别是两套模板 */
export function recognizeOutboundIssue(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, OutboundIssueOcrResult>("/inbound-returns/recognize-issue", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** 发料单图片先只上传、暂不识别——"校对工作台"一次选好几张图时用，图先存到服务器上
 * （不怕关浏览器/刷新页面丢文件），点哪张的"校对"再识别哪张 */
export function uploadIssueImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, { url: string }>("/inbound-returns/upload-issue-image", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** 识别一张已经用 uploadIssueImage 传过的发料单图片，按 url 直接识别，不用再重新上传一遍 */
export function recognizeOutboundIssueByUrl(url: string) {
  return request.post<never, OutboundIssueOcrResult>("/inbound-returns/recognize-issue-by-url", { url });
}

export function createInboundReturn(dto: CreateInboundReturnDto) {
  return request.post<never, InboundReturnListItem>("/inbound-returns", dto);
}

export function updateInboundReturn(id: string, dto: UpdateInboundReturnDto) {
  return request.patch<never, InboundReturnListItem>(`/inbound-returns/${id}`, dto);
}

export function deleteInboundReturn(id: string) {
  return request.delete<never, { success: boolean }>(`/inbound-returns/${id}`);
}
