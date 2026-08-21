import type { BillingSummary, UpdateBillPaymentStatusDto } from "@kingbear/shared";
import request from "./request";

export function getBillingSummary(factoryId: string, yearMonth: string) {
  return request.get<never, BillingSummary>("/billing/summary", {
    params: { factoryId, yearMonth },
  });
}

export function updatePaymentStatus(dto: UpdateBillPaymentStatusDto) {
  return request.post<never, { success: boolean }>("/billing/payment-status", dto);
}
