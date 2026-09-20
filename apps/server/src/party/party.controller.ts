import { Controller, Get, Param, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { PartyService, assertRole } from './party.service';

class PartyLedgerQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth 格式应为 YYYY-MM' })
  yearMonth?: string;
}

/** 往来单位：玩具厂和代工厂的统一入口，只读——数据还是各自的表，这里只是把各种单据转成统一的流水 */
@Controller('parties')
export class PartyController {
  constructor(private readonly partyService: PartyService) {}

  @Get()
  list() {
    return this.partyService.list();
  }

  @Get(':role/:id')
  detail(@Param('role') role: string, @Param('id') id: string) {
    return this.partyService.detail(assertRole(role), id);
  }

  @Get(':role/:id/ledger')
  ledger(@Param('role') role: string, @Param('id') id: string, @Query() query: PartyLedgerQueryDto) {
    return this.partyService.ledger(assertRole(role), id, query.yearMonth);
  }
}
