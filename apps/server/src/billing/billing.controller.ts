import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingQueryDto } from './dto/billing-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('summary')
  getSummary(@Query() query: BillingQueryDto) {
    return this.billingService.getSummary(query);
  }

  @Post('payment-status')
  updatePaymentStatus(@Body() dto: UpdatePaymentStatusDto) {
    return this.billingService.updatePaymentStatus(dto);
  }
}
