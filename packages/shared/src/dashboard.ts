export interface DashboardTodayStats {
  inboundCount: number;
  processedQty: number;
  processedAmount: number;
  /** 今日按货号拆开的加工数量/金额——首页"关注货号"卡片按货号筛选实时数据要用 */
  bySku: DashboardSkuStat[];
}

export interface DashboardMonthStats {
  processedAmount: number;
  inboundCount: number;
  processedQty: number;
  unpaidAmount: number;
}

/** 近7天（含今天）里的一天：日期 + 当天加工数量/金额，凑不满7天的日子数量就是0，不是缺项 */
export interface DashboardDayStat {
  date: string;
  qty: number;
  amount: number;
}

export interface DashboardWeekStats {
  processedQty: number;
  processedAmount: number;
  inboundCount: number;
  /** 按日期升序，从6天前排到今天，固定7条 */
  daily: DashboardDayStat[];
  /** 近7天按货号（品类）拆开的加工数量/金额 */
  bySku: DashboardSkuStat[];
}

export interface FactoryRankingItem {
  factoryId: string;
  factoryName: string;
  monthAmount: number;
}

/** 本月加工数量按货号拆开的一行——不同货号的"个"不是一回事，不能加在一起看 */
export interface DashboardSkuStat {
  sku: string;
  name: string;
  qty: number;
  amount: number;
}

export interface DashboardAlerts {
  pendingConfirmCount: number;
  quantityDiffCount: number;
  unpaidBillCount: number;
}

/** "产品加工情况"面板里，一道工序在所选时间段内的加工数量/金额 */
export interface ProductRangeStepStat {
  sku: string;
  name: string;
  qty: number;
  amount: number;
}

/** 一个产品（工序的父级）在所选时间段内的汇总，children 是它下面各道工序自己的数字。
 * 没归到任何产品的工序，归到 productGroupId 为空字符串、名字"未归集"的这一组里 */
export interface ProductRangeGroupStat {
  productGroupId: string;
  productGroupName: string;
  factoryName: string;
  qty: number;
  amount: number;
  steps: ProductRangeStepStat[];
}

export interface ProductRangeSummary {
  groups: ProductRangeGroupStat[];
}

export interface DashboardOverview {
  today: DashboardTodayStats;
  week: DashboardWeekStats;
  month: DashboardMonthStats;
  ranking: FactoryRankingItem[];
  alerts: DashboardAlerts;
  monthBySku: DashboardSkuStat[];
  /** 不限时间范围的累计加工数量/金额，按货号拆开——"关注货号"卡片切到"所有"时用 */
  allTimeBySku: DashboardSkuStat[];
}
