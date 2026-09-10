import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CommonMaterialService } from './common-material.service';
import { CreateCommonMaterialDto } from './dto/create-common-material.dto';
import { UpdateCommonMaterialDto } from './dto/update-common-material.dto';

@Controller('common-materials')
export class CommonMaterialController {
  constructor(private readonly service: CommonMaterialService) {}

  @Post()
  create(@Body() dto: CreateCommonMaterialDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCommonMaterialDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
