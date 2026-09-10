import type { Asset, CreateAssetDto, UpdateAssetDto } from "@kingbear/shared";
import request from "./request";

export function listAssets() {
  return request.get<never, Asset[]>("/assets");
}

/** 领用凭证图片单张上传，返回可访问的 URL——攒够几张再一起随表单提交 */
export function uploadAssetImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  return request.post<never, { url: string }>("/assets/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
}

export function createAsset(dto: CreateAssetDto) {
  return request.post<never, Asset>("/assets", dto);
}

export function updateAsset(id: string, dto: UpdateAssetDto) {
  return request.patch<never, Asset>(`/assets/${id}`, dto);
}

export function deleteAsset(id: string) {
  return request.delete<never, { success: boolean }>(`/assets/${id}`);
}
