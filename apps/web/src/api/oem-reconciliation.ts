import type { MaterialReconciliationRow } from "@kingbear/shared";
import request from "./request";

export function getOemReconciliation() {
  return request.get<never, MaterialReconciliationRow[]>("/oem-reconciliation");
}
