import type {
  CommonMaterialReturnListItem,
  CreateCommonMaterialReturnDto,
  UpdateCommonMaterialReturnDto,
} from "@kingbear/shared";
import request from "./request";

export function listCommonMaterialReturns() {
  return request.get<never, CommonMaterialReturnListItem[]>("/common-material-returns");
}

export function createCommonMaterialReturn(dto: CreateCommonMaterialReturnDto) {
  return request.post<never, CommonMaterialReturnListItem>("/common-material-returns", dto);
}

export function updateCommonMaterialReturn(id: string, dto: UpdateCommonMaterialReturnDto) {
  return request.patch<never, CommonMaterialReturnListItem>(`/common-material-returns/${id}`, dto);
}

export function deleteCommonMaterialReturn(id: string) {
  return request.delete<never, { success: boolean }>(`/common-material-returns/${id}`);
}
