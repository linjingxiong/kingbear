import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AssetTypeService } from './asset-type.service';
import { CreateAssetTypeDto } from './dto/create-asset-type.dto';
import { UpdateAssetTypeDto } from './dto/update-asset-type.dto';

@Controller('asset-types')
export class AssetTypeController {
  constructor(private readonly service: AssetTypeService) {}

  @Post()
  create(@Body() dto: CreateAssetTypeDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
