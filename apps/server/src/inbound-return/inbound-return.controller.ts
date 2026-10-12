import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { InboundReturnService } from './inbound-return.service';
import { CreateInboundReturnDto } from './dto/create-inbound-return.dto';
import { UpdateInboundReturnDto } from './dto/update-inbound-return.dto';
import { inboundReturnImageMulterOptions, toDiskPath, toPublicUploadUrl } from '../upload/upload.config';

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

  /** 上传发料单图片，识别的是原材料（物料名称+重量），跟退货识别模板不一样 */
  @Post('recognize-issue')
  @UseInterceptors(FileInterceptor('file', inboundReturnImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  async recognizeIssue(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = toPublicUploadUrl(this.uploadDir, file.path);
    const ocr = await this.returnService.recognizeIssue(file.path);
    return { imageUrl, ...ocr };
  }

  /** 发料单图片先只上传、暂不识别——"校对工作台"一次选好几张图时用，先把图存到服务器上
   * （不受浏览器关闭/刷新影响），点哪一张的"校对"再识别哪一张，不用等全部图都识别完才能看 */
  @Post('upload-issue-image')
  @UseInterceptors(FileInterceptor('file', inboundReturnImageMulterOptions(process.env.UPLOAD_DIR ?? 'uploads')))
  uploadIssueImage(@UploadedFile() file: Express.Multer.File) {
    return { url: toPublicUploadUrl(this.uploadDir, file.path) };
  }

  /** 识别一张已经用 upload-issue-image 传过的发料单图片，按 url 直接找磁盘上的文件，
   * 不用再重新上传一遍 */
  @Post('recognize-issue-by-url')
  async recognizeIssueByUrl(@Body('url') url: string) {
    const imagePath = toDiskPath(this.uploadDir, url);
    const ocr = await this.returnService.recognizeIssue(imagePath);
    return { imageUrl: url, ...ocr };
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
