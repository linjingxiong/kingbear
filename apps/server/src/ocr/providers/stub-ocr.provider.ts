import { Injectable, Logger } from '@nestjs/common';
import { OcrProvider, OcrRawResult } from '../ocr.types';

/**
 * 占位实现：还没接入真实的多模态大模型 API 之前，让整个入库流程可以跑通联调。
 * 返回一个"什么都没识别到"的结果，走完整套人工兜底流程（选玩具厂、按公式算数量）。
 *
 * 实现真实 Provider 时（Claude / GPT-4V / 通义千问VL），在这里新建一个类实现 OcrProvider，
 * 然后在 ocr.module.ts 里按 OCR_PROVIDER 环境变量切换即可。
 */
@Injectable()
export class StubOcrProvider implements OcrProvider {
  private readonly logger = new Logger(StubOcrProvider.name);

  async recognizeInboundImage(imagePath: string): Promise<OcrRawResult> {
    this.logger.warn(
      `OCR_PROVIDER 未配置真实供应商，${imagePath} 未做实际识别，返回空结果走人工录入`,
    );
    return { factoryName: null, date: null, items: [] };
  }
}
