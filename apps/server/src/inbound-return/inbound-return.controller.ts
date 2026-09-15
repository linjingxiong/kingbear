import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { InboundReturnService } from './inbound-return.service';
import { CreateInboundReturnDto } from './dto/create-inbound-return.dto';
import { UpdateInboundReturnDto } from './dto/update-inbound-return.dto';
import { inboundReturnImageMulterOptions, toPublicUploadUrl } from '../upload/upload.config';

@Controller('inbound-returns')
export class InboundReturnController {
  private readonly uploadDir: string;

  constructor(
    private readonly returnService: InboundReturnService,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>('uploadDir')!;
  }

  /** 上传退货单图片，OCR 识别，返回识别结果 + 图片 URL（不建记录，前端确认后再逐条 create） */
  @Post('recognize')
  @UseInterceptors(FileInterceptor('file', inboundReturnImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  async recognize(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = toPublicUploadUrl(this.uploadDir, file.path);
    const ocr = await this.returnService.recognize(file.path);
    return { imageUrl, ...ocr };
  }

  @Post()
  create(@Body() dto: CreateInboundReturnDto) {
    return this.returnService.create(dto);
  }

  @Get()
  findAll() {
    return this.returnService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.returnService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInboundReturnDto) {
    return this.returnService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.returnService.remove(id);
  }
}
