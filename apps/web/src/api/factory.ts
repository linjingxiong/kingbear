import type { CreateFactoryDto, FactoryListItem, UpdateFactoryDto } from "@kingbear/shared";
import request from "./request";

export function listFactories() {
  return request.get<never, FactoryListItem[]>("/factories");
}

export function createFactory(dto: CreateFactoryDto) {
  return request.post<never, FactoryListItem>("/factories", dto);
}

export function updateFactory(id: string, dto: UpdateFactoryDto) {
  return request.patch<never, FactoryListItem>(`/factories/${id}`, dto);
}

export function deleteFactory(id: string) {
  return request.delete<never, { success: boolean }>(`/factories/${id}`);
}
