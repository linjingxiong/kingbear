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

export function createInboundReturn(dto: CreateInboundReturnDto) {
  return request.post<never, InboundReturnListItem>("/inbound-returns", dto);
}

export function updateInboundReturn(id: string, dto: UpdateInboundReturnDto) {
  return request.patch<never, InboundReturnListItem>(`/inbound-returns/${id}`, dto);
}

export function deleteInboundReturn(id: string) {
  return request.delete<never, { success: boolean }>(`/inbound-returns/${id}`);
}
