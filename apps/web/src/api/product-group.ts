import type { CreateProductGroupDto, ProductGroup, UpdateProductGroupDto } from "@kingbear/shared";
import request from "./request";

export function listProductGroupsByFactory(factoryId: string) {
  return request.get<never, ProductGroup[]>("/product-groups", { params: { factoryId } });
}

export function createProductGroup(dto: CreateProductGroupDto) {
  return request.post<never, ProductGroup>("/product-groups", dto);
}

export function updateProductGroup(id: string, dto: UpdateProductGroupDto) {
  return request.patch<never, ProductGroup>(`/product-groups/${id}`, dto);
}

export function deleteProductGroup(id: string) {
  return request.delete<never, { success: boolean }>(`/product-groups/${id}`);
}
