import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AssetService } from './asset.service';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { assetImageMulterOptions, toPublicUploadUrl } from '../upload/upload.config';

@Controller('assets')
export class AssetController {
  private readonly uploadDir: string;

  constructor(
    private readonly assetService: AssetService,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>('uploadDir')!;
  }

  /** 领用凭证图片单张上传，返回可访问的 URL——前端攒够几张再一起提交表单，
   * 跟入库单图片上传是同一套模式，只是不需要 OCR/建单那一整套后续流程 */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', assetImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  upload(@UploadedFile() file: Express.Multer.File) {
    return { url: toPublicUploadUrl(this.uploadDir, file.path) };
  }

  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.assetService.create(dto);
  }

  @Get()
  findAll() {
    return this.assetService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assetService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAssetDto) {
    return this.assetService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.assetService.remove(id);
  }
}
