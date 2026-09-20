/**
 * 往来单位：我打交道的对象——上游的玩具厂、下游的代工厂（以后还会有工人/加工代理）。
 * 这一层是"只读的统一视图"：玩具厂和代工厂在数据库里还是各自的表、各自的单据表，
 * 一条数据都没动；后端把各种单据实时转成下面这种统一的"流水行"，前端就能在一个
 * 详情页里按时间看这个单位所有的出入库。
 */
export type PartyRole = "toy_factory" | "oem_factory";

/** 流水方向统一按"相对于我"来说：in=收进（货到了我手里），out=发出（货离开了我手里）。
 * 玩具厂那边的单据名（入库单/出库单）是它自己的视角，代工厂那边（物料发放/成品回收）是我的视角，
 * 两边叫法方向是反的，所以统一之后只用收进/发出，原来的单据名放在 typeLabel 里当标签。 */
export type LedgerDirection = "in" | "out";

export type LedgerSource =
  | "inbound" // 玩具厂入库单：我交货给玩具厂 → 发出
  | "outbound_issue" // 玩具厂出库单·发料：玩具厂发原料/半成品给我 → 收进
  | "outbound_return" // 玩具厂出库单·退货：不合格的货退回给我 → 收进
  | "material_issuance" // 代工厂物料发放：我发物料给代工厂 → 发出
  | "oem_receipt" // 代工厂成品回收：代工厂交回成品/半成品 → 收进
  | "common_material_return"; // 代工厂通用物料回收（框等）→ 收进

export interface PartyBase {
  id: string;
  role: PartyRole;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
}

/** 往来单位列表里的一行：基础资料 + 流水概况 */
export interface PartyListItem extends PartyBase {
  /** 流水总条数（每个货号/物料一行算一条） */
  recordCount: number;
  inCount: number;
  outCount: number;
  /** 最近一次往来的日期（ISO），没有任何流水时为 null */
  lastDate: string | null;
}

/** 统一的流水行——一行 = 一个货号或一种物料的一次出入库 */
export interface PartyLedgerRow {
  /** 前端列表的唯一 key：来源 + 原单据 id + 行号 */
  key: string;
  source: LedgerSource;
  /** 原单据（那条入库单/发料记录…）的 id，用来跳回去处理 */
  sourceId: string;
  /** ISO 日期 */
  date: string;
  direction: LedgerDirection;
  /** 原来的单据叫法，比如"入库单""出库单·发料""出库单·退货""物料发放""成品回收" */
  typeLabel: string;
  /** product=带货号的成品/半成品，material=物料 */
  itemKind: "product" | "material";
  /** 汇总用的分组 key：货号或物料名 */
  itemKey: string;
  itemName: string;
  sku?: string;
  /** 物料发放时，这批料是给哪个产品用的（通用物料没有） */
  group?: string;
  qty: number;
  weightJin?: number;
  unitWeightG?: number;
  /** 入库单号（只有入库单有） */
  code?: string;
  /** 退货原因 */
  reason?: string;
  remark?: string;
  images: string[];
}

export interface PartyLedgerQuery {
  /** 如 "2026-08"，不传就是所有时间 */
  yearMonth?: string;
}
