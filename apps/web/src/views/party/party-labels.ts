import type { LedgerDirection, LedgerSource, PartyRole } from "@kingbear/shared";

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  toy_factory: "玩具厂",
  oem_factory: "代工厂",
  me: "我",
};

/** 方向按"当前看的这个单位"：入库=货流进这个单位，出库=货从这个单位流出；
 * 看"我"时反过来叫收进/发出（我是中间环节，货到我手里是收进、离开我手里是发出） */
export function directionLabel(role: PartyRole, direction: LedgerDirection): string {
  if (role === "me") return direction === "in" ? "收进" : "发出";
  return direction === "in" ? "入库" : "出库";
}

/** 每种流水的原单据在哪个页面处理——详情里点"去处理"跳过去 */
export function sourceRoute(source: LedgerSource): { path: string; query?: Record<string, string> } {
  switch (source) {
    case "inbound":
      return { path: "/inbound" };
    case "outbound_issue":
    case "outbound_return":
      return { path: "/inbound", query: { tab: "return" } };
    case "material_issuance":
      return { path: "/material-flow" };
    case "oem_receipt":
      return { path: "/material-flow", query: { tab: "receipt" } };
    case "common_material_return":
      return { path: "/material-flow", query: { tab: "common-return" } };
  }
}
