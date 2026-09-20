import type { LedgerDirection, LedgerSource, PartyRole } from "@kingbear/shared";

export const PARTY_ROLE_LABEL: Record<PartyRole, string> = {
  toy_factory: "玩具厂",
  oem_factory: "代工厂",
};

/** 方向统一按"相对于我"：收进=货到了我手里，发出=货离开了我手里 */
export const DIRECTION_LABEL: Record<LedgerDirection, string> = {
  in: "收进",
  out: "发出",
};

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
