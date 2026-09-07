export interface DashboardTodayStats {
  inboundCount: number;
  processedQty: number;
  processedAmount: number;
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

export interface DashboardOverview {
  today: DashboardTodayStats;
  week: DashboardWeekStats;
  month: DashboardMonthStats;
  ranking: FactoryRankingItem[];
  alerts: DashboardAlerts;
  monthBySku: DashboardSkuStat[];
}
