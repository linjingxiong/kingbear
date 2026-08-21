import type { DashboardOverview } from "@kingbear/shared";
import request from "./request";

export function getDashboardOverview() {
  return request.get<never, DashboardOverview>("/dashboard/overview");
}
