import type { PartyBase, PartyLedgerRow, PartyListItem, PartyRole } from "@kingbear/shared";
import request from "./request";

/** 往来单位（玩具厂 + 代工厂）统一列表，带流水概况 */
export function listParties() {
  return request.get<never, PartyListItem[]>("/parties");
}

export function getParty(role: PartyRole, id: string) {
  return request.get<never, PartyBase>(`/parties/${role}/${id}`);
}

/** 这个单位的统一流水；不传 yearMonth 就是所有时间 */
export function getPartyLedger(role: PartyRole, id: string, yearMonth?: string) {
  return request.get<never, PartyLedgerRow[]>(`/parties/${role}/${id}/ledger`, { params: { yearMonth } });
}
