import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { MaterialIssuanceService } from './material-issuance.service';
import { CreateMaterialIssuanceDto } from './dto/create-material-issuance.dto';
import { UpdateMaterialIssuanceDto } from './dto/update-material-issuance.dto';

@Controller('material-issuances')
export class MaterialIssuanceController {
  constructor(private readonly issuanceService: MaterialIssuanceService) {}

  @Post()
  create(@Body() dto: CreateMaterialIssuanceDto) {
    return this.issuanceService.create(dto);
  }

  @Get()
  findAll() {
    return this.issuanceService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.issuanceService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMaterialIssuanceDto) {
    return this.issuanceService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.issuanceService.remove(id);
  }
}
