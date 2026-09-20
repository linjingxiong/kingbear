import { Controller, Delete, Get, Param, Query } from '@nestjs/common';
import { IsOptional, Matches } from 'class-validator';
import { PartyService, assertRole } from './party.service';

class PartyLedgerQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth 格式应为 YYYY-MM' })
  yearMonth?: string;
}

/** 往来单位：玩具厂和代工厂的统一入口。数据还是各自的表；查看是把各种单据转成统一的流水，
 * 新增/编辑走原来玩具厂、代工厂各自的接口，删除统一走这里（带"名下有数据就拒绝"的保护） */
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

  @Delete(':role/:id')
  remove(@Param('role') role: string, @Param('id') id: string) {
    return this.partyService.remove(assertRole(role), id);
  }

  @Get(':role/:id/ledger')
  ledger(@Param('role') role: string, @Param('id') id: string, @Query() query: PartyLedgerQueryDto) {
    return this.partyService.ledger(assertRole(role), id, query.yearMonth);
  }
}
