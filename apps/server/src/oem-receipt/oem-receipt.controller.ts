import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { OemReceiptService } from './oem-receipt.service';
import { CreateOemReceiptDto } from './dto/create-oem-receipt.dto';
import { UpdateOemReceiptDto } from './dto/update-oem-receipt.dto';
import { oemReceiptImageMulterOptions, toPublicUploadUrl } from '../upload/upload.config';

@Controller('oem-receipts')
export class OemReceiptController {
  private readonly uploadDir: string;

  constructor(
    private readonly receiptService: OemReceiptService,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>('uploadDir')!;
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', oemReceiptImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { url: toPublicUploadUrl(this.uploadDir, file.path) };
  }

  @Post()
  create(@Body() dto: CreateOemReceiptDto) {
    return this.receiptService.create(dto);
  }

  @Get()
  findAll() {
    return this.receiptService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.receiptService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOemReceiptDto) {
    return this.receiptService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.receiptService.remove(id);
  }
}
