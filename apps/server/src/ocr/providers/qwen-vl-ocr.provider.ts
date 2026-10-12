import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { MaterialDispatchOcrResult, OcrProvider, OcrRawResult, OemReceiptOcrResult, OutboundIssueOcrResult } from '../ocr.types';
import {
  buildDispatchSystemPrompt,
  buildOemReceiptSystemPrompt,
  buildOutboundIssueSystemPrompt,
  buildSystemPrompt,
} from './ocr-prompts';
import {
  emptyDispatchResult,
  emptyOemReceiptResult,
  emptyOutboundIssueResult,
  emptyResult,
  parseDispatchResult,
  parseOemReceiptResult,
  parseOutboundIssueResult,
  parseResult,
} from './ocr-parse';
import { callOpenAiCompatibleVl } from './openai-compatible-vl';

// 阿里云 DashScope 的 OpenAI 兼容模式端点，通义千问 VL 系列模型都走这个
// https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const PROVIDER_LABEL = '通义千问 VL';

/** 通义千问 VL（阿里云 DashScope）的 OCR Provider 实现 */
@Injectable()
export class QwenVlOcrProvider implements OcrProvider {
  private readonly logger = new Logger(QwenVlOcrProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async recognizeInboundImage(imagePath: string): Promise<OcrRawResult> {
    const content = await this.call(imagePath, buildSystemPrompt(), '请识别这张入库单据图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyResult();
    return parseResult(content, this.logger, PROVIDER_LABEL);
  }

  async recognizeMaterialDispatchImage(imagePath: string): Promise<MaterialDispatchOcrResult> {
    const content = await this.call(imagePath, buildDispatchSystemPrompt(), '请识别这张发料单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyDispatchResult();
    return parseDispatchResult(content, this.logger, PROVIDER_LABEL);
  }

  async recognizeOutboundIssueImage(imagePath: string): Promise<OutboundIssueOcrResult> {
    const content = await this.call(imagePath, buildOutboundIssueSystemPrompt(), '请识别这张玩具厂发料出库单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyOutboundIssueResult();
    return parseOutboundIssueResult(content, this.logger, PROVIDER_LABEL);
  }

  async recognizeOemReceiptImage(imagePath: string): Promise<OemReceiptOcrResult> {
    const content = await this.call(imagePath, buildOemReceiptSystemPrompt(), '请识别这张成品/半成品回收单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyOemReceiptResult();
    return parseOemReceiptResult(content, this.logger, PROVIDER_LABEL);
  }

  private async call(imagePath: string, systemPrompt: string, userText: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('ocr.apiKey');
    if (!apiKey) {
      this.logger.warn('OCR_API_KEY 未配置，无法调用通义千问 VL，回退为空结果走人工录入');
      return null;
    }
    const model = this.configService.get<string>('ocr.model') || 'qwen-vl-plus';
    return callOpenAiCompatibleVl({
      endpoint: DASHSCOPE_ENDPOINT,
      apiKey,
      model,
      systemPrompt,
      userText,
      imagePath,
      providerLabel: PROVIDER_LABEL,
      logger: this.logger,
    });
  }
}
