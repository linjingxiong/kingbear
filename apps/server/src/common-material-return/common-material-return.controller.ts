import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CommonMaterialReturnService } from './common-material-return.service';
import { CreateCommonMaterialReturnDto } from './dto/create-common-material-return.dto';
import { UpdateCommonMaterialReturnDto } from './dto/update-common-material-return.dto';

@Controller('common-material-returns')
export class CommonMaterialReturnController {
  constructor(private readonly service: CommonMaterialReturnService) {}

  @Post()
  create(@Body() dto: CreateCommonMaterialReturnDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommonMaterialReturnDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
