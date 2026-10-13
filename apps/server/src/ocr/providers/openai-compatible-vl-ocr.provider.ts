import { Logger } from '@nestjs/common';
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

export interface OpenAiCompatibleVlConfig {
  endpoint: string;
  /** 日志/报错里打的厂商名，比如"通义千问 VL"、"智谱 GLM-4V" */
  label: string;
  defaultModel: string;
}

/** 通义千问 VL（阿里云 DashScope）、智谱 GLM-4V（智谱 AI 开放平台）等视觉模型都走同一套
 * OpenAI 兼容聊天接口，prompt 构建/JSON 解析/HTTP 调用完全一样，只有端点、模型名、日志里
 * 打的厂商名不同——所以不给每个厂商单独写一个 provider 类，由 ocr.module.ts 按
 * {endpoint, label, defaultModel} 配置 new 出不同实例。以后再接别的同类模型，不用抄一遍
 * 方法体，在 ocr.module.ts 里加一个 case 就行 */
export class OpenAiCompatibleVlOcrProvider implements OcrProvider {
  private readonly logger: Logger;

  constructor(
    private readonly configService: ConfigService,
    private readonly cfg: OpenAiCompatibleVlConfig,
  ) {
    this.logger = new Logger(`OcrProvider(${cfg.label})`);
  }

  async recognizeInboundImage(imagePath: string): Promise<OcrRawResult> {
    const content = await this.call(imagePath, buildSystemPrompt(), '请识别这张入库单据图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyResult();
    return parseResult(content, this.logger, this.cfg.label);
  }

  async recognizeMaterialDispatchImage(imagePath: string): Promise<MaterialDispatchOcrResult> {
    const content = await this.call(imagePath, buildDispatchSystemPrompt(), '请识别这张发料单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyDispatchResult();
    return parseDispatchResult(content, this.logger, this.cfg.label);
  }

  async recognizeOutboundIssueImage(imagePath: string): Promise<OutboundIssueOcrResult> {
    const content = await this.call(imagePath, buildOutboundIssueSystemPrompt(), '请识别这张玩具厂发料出库单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyOutboundIssueResult();
    return parseOutboundIssueResult(content, this.logger, this.cfg.label);
  }

  async recognizeOemReceiptImage(imagePath: string): Promise<OemReceiptOcrResult> {
    const content = await this.call(imagePath, buildOemReceiptSystemPrompt(), '请识别这张成品/半成品回收单图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyOemReceiptResult();
    return parseOemReceiptResult(content, this.logger, this.cfg.label);
  }

  private async call(imagePath: string, systemPrompt: string, userText: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('ocr.apiKey');
    if (!apiKey) {
      this.logger.warn(`OCR_API_KEY 未配置，无法调用${this.cfg.label}，回退为空结果走人工录入`);
      return null;
    }
    const model = this.configService.get<string>('ocr.model') || this.cfg.defaultModel;
    return callOpenAiCompatibleVl({
      endpoint: this.cfg.endpoint,
      apiKey,
      model,
      systemPrompt,
      userText,
      imagePath,
      providerLabel: this.cfg.label,
      logger: this.logger,
    });
  }
}
