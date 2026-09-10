import type { CommonMaterial, CreateCommonMaterialDto, UpdateCommonMaterialDto } from "@kingbear/shared";
import request from "./request";

export function listCommonMaterials() {
  return request.get<never, CommonMaterial[]>("/common-materials");
}

export function createCommonMaterial(dto: CreateCommonMaterialDto) {
  return request.post<never, CommonMaterial>("/common-materials", dto);
}

export function updateCommonMaterial(id: string, dto: UpdateCommonMaterialDto) {
  return request.patch<never, CommonMaterial>(`/common-materials/${id}`, dto);
}

export function deleteCommonMaterial(id: string) {
  return request.delete<never, { success: boolean }>(`/common-materials/${id}`);
}
