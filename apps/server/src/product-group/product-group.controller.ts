import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProductGroupService } from './product-group.service';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';

@Controller('product-groups')
export class ProductGroupController {
  constructor(private readonly productGroupService: ProductGroupService) {}

  @Post()
  create(@Body() dto: CreateProductGroupDto) {
    return this.productGroupService.create(dto);
  }

  @Get()
  findByFactory(@Query('factoryId') factoryId: string) {
    return this.productGroupService.findByFactory(factoryId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productGroupService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductGroupDto) {
    return this.productGroupService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productGroupService.remove(id);
  }
}
