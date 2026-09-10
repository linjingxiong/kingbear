import type { CreateOemFactoryDto, OemFactory, UpdateOemFactoryDto } from "@kingbear/shared";
import request from "./request";

export function listOemFactories() {
  return request.get<never, OemFactory[]>("/oem-factories");
}

export function createOemFactory(dto: CreateOemFactoryDto) {
  return request.post<never, OemFactory>("/oem-factories", dto);
}

export function updateOemFactory(id: string, dto: UpdateOemFactoryDto) {
  return request.patch<never, OemFactory>(`/oem-factories/${id}`, dto);
}

export function deleteOemFactory(id: string) {
  return request.delete<never, { success: boolean }>(`/oem-factories/${id}`);
}
