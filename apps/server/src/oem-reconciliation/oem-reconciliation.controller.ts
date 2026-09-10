import { Controller, Get } from '@nestjs/common';
import { OemReconciliationService } from './oem-reconciliation.service';

@Controller('oem-reconciliation')
export class OemReconciliationController {
  constructor(private readonly reconciliationService: OemReconciliationService) {}

  @Get()
  getReconciliation() {
    return this.reconciliationService.getReconciliation();
  }
}
