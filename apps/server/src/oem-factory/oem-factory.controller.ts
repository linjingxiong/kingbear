import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OemFactoryService } from './oem-factory.service';
import { CreateOemFactoryDto } from './dto/create-oem-factory.dto';
import { UpdateOemFactoryDto } from './dto/update-oem-factory.dto';

@Controller('oem-factories')
export class OemFactoryController {
  constructor(private readonly oemFactoryService: OemFactoryService) {}

  @Post()
  create(@Body() dto: CreateOemFactoryDto) {
    return this.oemFactoryService.create(dto);
  }

  @Get()
  findAll() {
    return this.oemFactoryService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.oemFactoryService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOemFactoryDto) {
    return this.oemFactoryService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.oemFactoryService.remove(id);
  }
}
