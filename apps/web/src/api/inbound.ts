import type { ConfirmInboundDto, InboundListRow, InboundRecord, SearchInboundQuery } from "@kingbear/shared";
import request from "./request";

export function uploadInboundImage(file: File, force = false) {
  const form = new FormData();
  form.append("file", file);
  if (force) form.append("force", "true");
  return request.post<never, InboundRecord>("/inbound/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** 手工录入：不上传图片，直接建一条空记录，跳到确认页手动填 */
export function createManualInbound() {
  return request.post<never, InboundRecord>("/inbound/manual");
}

export function confirmInbound(id: string, dto: ConfirmInboundDto) {
  return request.post<never, InboundRecord>(`/inbound/${id}/confirm`, dto);
}

/** 确认页录入过程中实时查一下疑似重复，不用等到点"确认入库"才发现 */
export function checkInboundDuplicates(id: string, dto: Pick<ConfirmInboundDto, "factoryId" | "inboundDate" | "items">) {
  return request.post<never, { conflictCodes: string[] }>(`/inbound/${id}/check-duplicates`, dto);
}

export function updateInbound(id: string, dto: ConfirmInboundDto) {
  return request.patch<never, InboundRecord>(`/inbound/${id}`, dto);
}

export function searchInbound(query: SearchInboundQuery) {
  return request.get<never, { list: InboundListRow[]; total: number; page: number; pageSize: number }>(
    "/inbound",
    { params: query },
  );
}

export function getInbound(id: string) {
  return request.get<never, InboundRecord>(`/inbound/${id}`);
}

export function deleteInbound(id: string) {
  return request.delete<never, { success: boolean }>(`/inbound/${id}`);
}

/** 旋转入库单图片：服务端直接把原图文件转正保存，不是前端 CSS 转一下就完事 */
export function rotateInboundImage(id: string, direction: "left" | "right") {
  return request.post<never, InboundRecord>(`/inbound/${id}/rotate-image`, { direction });
}
