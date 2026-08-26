import type { ConfirmInboundDto, InboundRecord, SearchInboundQuery } from "@kingbear/shared";
import request from "./request";

export function uploadInboundImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, InboundRecord>("/inbound/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function confirmInbound(id: string, dto: ConfirmInboundDto) {
  return request.post<never, InboundRecord>(`/inbound/${id}/confirm`, dto);
}

export function updateInbound(id: string, dto: ConfirmInboundDto) {
  return request.patch<never, InboundRecord>(`/inbound/${id}`, dto);
}

export function searchInbound(query: SearchInboundQuery) {
  return request.get<never, { list: InboundRecord[]; total: number; page: number; pageSize: number }>(
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
