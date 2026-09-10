import type {
  CreateMaterialIssuanceDto,
  MaterialDispatchOcrResult,
  MaterialIssuanceListItem,
  UpdateMaterialIssuanceDto,
} from "@kingbear/shared";
import request from "./request";

export function listMaterialIssuances() {
  return request.get<never, MaterialIssuanceListItem[]>("/material-issuances");
}

/** 上传发料单图片做 OCR 识别，返回识别结果 + 图片 URL（不建记录） */
export function recognizeMaterialDispatch(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, MaterialDispatchOcrResult>("/material-issuances/recognize", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function createMaterialIssuance(dto: CreateMaterialIssuanceDto) {
  return request.post<never, MaterialIssuanceListItem>("/material-issuances", dto);
}

export function updateMaterialIssuance(id: string, dto: UpdateMaterialIssuanceDto) {
  return request.patch<never, MaterialIssuanceListItem>(`/material-issuances/${id}`, dto);
}

export function deleteMaterialIssuance(id: string) {
  return request.delete<never, { success: boolean }>(`/material-issuances/${id}`);
}
