import type { AssetType, CreateAssetTypeDto, UpdateAssetTypeDto } from "@kingbear/shared";
import request from "./request";

export function listAssetTypes() {
  return request.get<never, AssetType[]>("/asset-types");
}

export function createAssetType(dto: CreateAssetTypeDto) {
  return request.post<never, AssetType>("/asset-types", dto);
}

export function updateAssetType(id: string, dto: UpdateAssetTypeDto) {
  return request.patch<never, AssetType>(`/asset-types/${id}`, dto);
}

export function deleteAssetType(id: string) {
  return request.delete<never, { success: boolean }>(`/asset-types/${id}`);
}
