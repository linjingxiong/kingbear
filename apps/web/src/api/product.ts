import type { CreateProductDto, Product, UpdateProductDto } from "@kingbear/shared";
import request from "./request";

export function listProductsByFactory(factoryId: string) {
  return request.get<never, Product[]>("/products", { params: { factoryId } });
}

/** 不限玩具厂，全量按货号查——用来在玩具厂还没识别出来的时候，拿货号反查它属于哪个玩具厂 */
export function findProductsBySku(sku: string) {
  return request.get<never, Product[]>("/products", { params: { sku } });
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
