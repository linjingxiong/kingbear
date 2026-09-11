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

  /** 上传回收单图片，OCR 识别，返回识别结果 + 图片 URL（不建记录，前端确认后再逐条 create） */
  @Post('recognize')
  @UseInterceptors(FileInterceptor('file', oemReceiptImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  async recognize(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = toPublicUploadUrl(this.uploadDir, file.path);
    const ocr = await this.receiptService.recognize(file.path);
    return { imageUrl, ...ocr };
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
