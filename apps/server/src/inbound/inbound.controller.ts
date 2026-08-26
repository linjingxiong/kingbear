import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { InboundService } from './inbound.service';
import { ConfirmInboundDto } from './dto/confirm-inbound.dto';
import { SearchInboundDto } from './dto/search-inbound.dto';
import { RotateImageDto } from './dto/rotate-image.dto';
import { inboundImageMulterOptions, toPublicUploadUrl } from '../upload/upload.config';

@Controller('inbound')
export class InboundController {
  private readonly uploadDir: string;

  constructor(
    private readonly inboundService: InboundService,
    configService: ConfigService,
  ) {
    this.uploadDir = configService.get<string>('uploadDir')!;
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', inboundImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = toPublicUploadUrl(this.uploadDir, file.path);
    return this.inboundService.createFromUpload(imageUrl, file.path);
  }

  @Post(':id/confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmInboundDto) {
    return this.inboundService.confirm(id, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ConfirmInboundDto) {
    return this.inboundService.update(id, dto);
  }

  @Post(':id/rotate-image')
  rotateImage(@Param('id') id: string, @Body() dto: RotateImageDto) {
    return this.inboundService.rotateImage(id, dto.direction);
  }

  @Get()
  findAll(@Query() query: SearchInboundDto) {
    return this.inboundService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inboundService.findOne(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.inboundService.remove(id);
  }
}
