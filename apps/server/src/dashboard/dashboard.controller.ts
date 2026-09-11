import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverview() {
    return this.dashboardService.getOverview();
  }

  /** 不传 dateFrom/dateTo 就是不限时间（全部） */
  @Get('product-range-summary')
  getProductRangeSummary(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.dashboardService.getProductRangeSummary(dateFrom, dateTo);
  }
}
