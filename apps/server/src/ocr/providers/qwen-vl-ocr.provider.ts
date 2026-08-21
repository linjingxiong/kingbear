import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type { OcrProvider, OcrRawItem, OcrRawResult } from '../ocr.types';

// 阿里云 DashScope 的 OpenAI 兼容模式端点，通义千问 VL 系列模型都走这个
// https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

const SYSTEM_PROMPT = `你是玩具加工厂的入库单据识别助手。用户会给你一张入库单据的照片，单据上一般包含：
玩具厂名称、日期、若干行产品明细（货号、名称、重量(斤)、单个克重(g)、数量）。

请你识别图片内容，只输出一个 JSON 对象，不要输出任何解释性文字、不要用 markdown 代码块包裹，格式如下：

{
  "factoryName": "识别到的玩具厂名称，识别不到给 null",
  "date": "入库日期，格式 yyyy-MM-dd，识别不到给 null",
  "items": [
    {
      "sku": "货号",
      "name": "产品名称",
      "weightJin": 重量数字（单位：斤，纯数字不带单位）,
      "unitWeightG": 单个克重数字（单位：克，纯数字不带单位）,
      "qtyDeclared": 单据上写的数量（纯数字），如果单据没有直接写数量就给 null
    }
  ]
}

注意：
- 数字字段必须是 JSON number，不要带单位、不要用字符串
- 单据上如果有多行产品，items 里要包含所有行
- 完全看不清或者不是入库单据的情况下，factoryName/date 给 null，items 给空数组`;

/** 通义千问 VL（阿里云 DashScope）的 OCR Provider 实现 */
@Injectable()
export class QwenVlOcrProvider implements OcrProvider {
  private readonly logger = new Logger(QwenVlOcrProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async recognizeInboundImage(imagePath: string): Promise<OcrRawResult> {
    const apiKey = this.configService.get<string>('ocr.apiKey');
    if (!apiKey) {
      this.logger.warn('OCR_API_KEY 未配置，无法调用通义千问 VL，回退为空结果走人工录入');
      return emptyResult();
    }

    try {
      const imageDataUri = await toDataUri(imagePath);
      const model = this.configService.get<string>('ocr.model') || 'qwen-vl-plus';

      const response = await fetch(DASHSCOPE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageDataUri } },
                { type: 'text', text: '请识别这张入库单据图片，按要求的 JSON 格式输出。' },
              ],
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`通义千问 VL 调用失败 (HTTP ${response.status}): ${errText}`);
        return emptyResult();
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? '';
      return parseResult(content, this.logger);
    } catch (err) {
      this.logger.error(`通义千问 VL 调用异常: ${(err as Error).message}`);
      return emptyResult();
    }
  }
}

async function toDataUri(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  const mime = mimeFromExt(extname(filePath));
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/jpeg';
  }
}

/** 模型偶尔会用 ```json 代码块包一层，或者混杂几句解释文字，这里尽量把 JSON 主体抠出来 */
function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw.trim();
  return raw.slice(start, end + 1);
}

function parseResult(content: string, logger: Logger): OcrRawResult {
  try {
    const parsed = JSON.parse(extractJsonText(content)) as Partial<OcrRawResult>;
    return normalize(parsed);
  } catch (err) {
    logger.error(`通义千问 VL 返回内容不是合法 JSON，回退为空结果: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyResult();
  }
}

/** 兜底把各字段的类型/缺失值收拢成 OcrRawResult 该有的样子，避免脏数据传到后面的业务逻辑里炸掉 */
function normalize(parsed: Partial<OcrRawResult>): OcrRawResult {
  const items: OcrRawItem[] = Array.isArray(parsed.items)
    ? parsed.items
        .filter((item): item is OcrRawItem => !!item && typeof item === 'object')
        .map((item) => ({
          sku: toStr(item.sku),
          name: toStr(item.name),
          weightJin: toNum(item.weightJin),
          unitWeightG: toNum(item.unitWeightG),
          qtyDeclared: item.qtyDeclared == null ? null : toNum(item.qtyDeclared),
        }))
    : [];

  return {
    factoryName: parsed.factoryName ? toStr(parsed.factoryName) : null,
    date: parsed.date ? toStr(parsed.date) : null,
    items,
  };
}

function toStr(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function toNum(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
}

function emptyResult(): OcrRawResult {
  return { factoryName: null, date: null, items: [] };
}
