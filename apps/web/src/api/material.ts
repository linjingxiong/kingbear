import type { CreateMaterialDto, Material, UpdateMaterialDto } from "@kingbear/shared";
import request from "./request";

export function listMaterials() {
  return request.get<never, Material[]>("/materials");
}

export function createMaterial(dto: CreateMaterialDto) {
  return request.post<never, Material>("/materials", dto);
}

export function updateMaterial(id: string, dto: UpdateMaterialDto) {
  return request.patch<never, Material>(`/materials/${id}`, dto);
}

export function deleteMaterial(id: string) {
  return request.delete<never, { success: boolean }>(`/materials/${id}`);
}
