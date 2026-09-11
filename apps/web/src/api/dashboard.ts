import type { DashboardOverview, ProductRangeSummary } from "@kingbear/shared";
import request from "./request";

export function getDashboardOverview() {
  return request.get<never, DashboardOverview>("/dashboard/overview");
}

/** 不传 dateFrom/dateTo 就是不限时间（全部） */
export function getProductRangeSummary(dateFrom?: string, dateTo?: string) {
  return request.get<never, ProductRangeSummary>("/dashboard/product-range-summary", {
    params: { dateFrom, dateTo },
  });
}
