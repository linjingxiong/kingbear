import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { FactoryService } from './factory.service';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';

@Controller('factories')
export class FactoryController {
  constructor(private readonly factoryService: FactoryService) {}

  @Post()
  create(@Body() dto: CreateFactoryDto) {
    return this.factoryService.create(dto);
  }

  @Get()
  findAll() {
    return this.factoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.factoryService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFactoryDto) {
    return this.factoryService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.factoryService.remove(id);
  }
}
