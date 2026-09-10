import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { MaterialIssuanceService } from './material-issuance.service';
import { CreateMaterialIssuanceDto } from './dto/create-material-issuance.dto';
import { UpdateMaterialIssuanceDto } from './dto/update-material-issuance.dto';
import { materialDispatchImageMulterOptions, toPublicUploadUrl } from '../upload/upload.config';

@Controller('material-issuances')
export class MaterialIssuanceController {
  private readonly uploadDir: string;

  constructor(
    private readonly issuanceService: MaterialIssuanceService,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>('uploadDir')!;
  }

  /** 上传发料单图片，OCR 识别，返回识别结果 + 图片 URL（不建记录，前端确认后再逐条 create） */
  @Post('recognize')
  @UseInterceptors(
    FileInterceptor('file', materialDispatchImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')),
  )
  async recognize(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = toPublicUploadUrl(this.uploadDir, file.path);
    const ocr = await this.issuanceService.recognize(file.path);
    return { imageUrl, ...ocr };
  }

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
