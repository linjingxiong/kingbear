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
}
