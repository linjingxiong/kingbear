import type { CreateProductDto, Product, UpdateProductDto } from "@kingbear/shared";
import request from "./request";

export function listProductsByFactory(factoryId: string) {
  return request.get<never, Product[]>("/products", { params: { factoryId } });
}

export function createProduct(dto: CreateProductDto) {
  return request.post<never, Product>("/products", dto);
}

export function updateProduct(id: string, dto: UpdateProductDto) {
  return request.patch<never, Product>(`/products/${id}`, dto);
}

export function deleteProduct(id: string) {
  return request.delete<never, { success: boolean }>(`/products/${id}`);
}
