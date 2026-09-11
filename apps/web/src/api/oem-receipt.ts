import type { CreateOemReceiptDto, OemReceiptListItem, OemReceiptOcrResult, UpdateOemReceiptDto } from "@kingbear/shared";
import request from "./request";

export function listOemReceipts() {
  return request.get<never, OemReceiptListItem[]>("/oem-receipts");
}

/** 回收凭证图片单张上传，返回可访问的 URL——攒够几张再一起随表单提交 */
export function uploadOemReceiptImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, { url: string }>("/oem-receipts/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

/** 上传回收单图片做 OCR 识别，返回识别结果 + 图片 URL（不建记录） */
export function recognizeOemReceipt(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, OemReceiptOcrResult>("/oem-receipts/recognize", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function createOemReceipt(dto: CreateOemReceiptDto) {
  return request.post<never, OemReceiptListItem>("/oem-receipts", dto);
}

export function updateOemReceipt(id: string, dto: UpdateOemReceiptDto) {
  return request.patch<never, OemReceiptListItem>(`/oem-receipts/${id}`, dto);
}

export function deleteOemReceipt(id: string) {
  return request.delete<never, { success: boolean }>(`/oem-receipts/${id}`);
}
