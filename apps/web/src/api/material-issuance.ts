import type { CreateMaterialIssuanceDto, MaterialIssuanceListItem, UpdateMaterialIssuanceDto } from "@kingbear/shared";
import request from "./request";

export function listMaterialIssuances() {
  return request.get<never, MaterialIssuanceListItem[]>("/material-issuances");
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
