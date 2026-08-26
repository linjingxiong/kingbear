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
  month: DashboardMonthStats;
  ranking: FactoryRankingItem[];
  alerts: DashboardAlerts;
  monthBySku: DashboardSkuStat[];
}
