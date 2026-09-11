import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { extname } from 'path';
import type {
  MaterialDispatchOcrItem,
  MaterialDispatchOcrResult,
  OcrProvider,
  OcrRawItem,
  OcrRawResult,
  OemReceiptOcrItem,
  OemReceiptOcrResult,
} from '../ocr.types';

// 阿里云 DashScope 的 OpenAI 兼容模式端点，通义千问 VL 系列模型都走这个
// https://help.aliyun.com/zh/model-studio/developer-reference/compatibility-of-openai-with-dashscope
const DASHSCOPE_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

/** 每次调用都重新生成一遍，年份用的是"现在"，不会随着服务一直跑下去变成写死的老年份 */
function buildSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  return `你是玩具加工厂的入库单据识别助手。用户会给你一张入库单据的照片，单据上一般包含：
玩具厂名称、日期、若干行产品明细（货号、名称、重量(斤)、单个克重(g)、数量）。

请你识别图片内容，只输出一个 JSON 对象，不要输出任何解释性文字、不要用 markdown 代码块包裹，格式如下：

{
  "factoryName": "识别到的玩具厂名称，识别不到给 null",
  "date": "入库日期，格式 yyyy-MM-dd，识别不到给 null",
  "items": [
    {
      "sku": "货号，只填编号本身（通常是纯数字或字母数字），旁边如果写了\\"成品\\"\\"半成品\\"这类描述词，不要带进货号里",
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
- 货号（sku）字段只填编号本身，"成品"/"半成品"这类描述词即使紧挨着货号写，也不要拼进 sku
  里——这类词要么单独归到 name 里，要么直接忽略，不然货号会跟产品库里存的对不上
- 日期年份如果单据上只写了两位数字（比如"26年8月2日"），一律理解成 20xx 年（"26年"就是
  2026 年），不要凭空猜成别的年份；月、日也是同理，照单据上写的数字来，不要自己改
- 单据上如果压根没写年份（比如只写了"7月28日"，连两位数字的年份都没有），年份就按 ${currentYear}
  年来填，月、日照单据上写的数字来——不要因为年份不确定就把整个 date 字段扔掉，月、日这些
  能看清的信息不能因为年份不确定就一起丢了，人工确认页看到年份不对，改一下年份比把月、日
  重新翻回单据上核对一遍要省事得多
- 完全看不清或者不是入库单据的情况下，factoryName/date 给 null，items 给空数组`;
}

/** 每次调用都重新生成，年份用"现在" */
function buildDispatchSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  return `你是玩具加工厂的发料单据识别助手。用户会给你一张"发料单"的照片——把物料发给某个代工厂时开的单据，
上面一般包含：代工厂名称、产品名称（可选）、日期、若干行物料明细（物料名、数量）。

只输出一个 JSON 对象，不要输出任何解释文字、不要用 markdown 代码块包裹，格式：

{
  "oemFactoryName": "代工厂名称，识别不到给 null",
  "productName": "产品名称，识别不到给 null",
  "date": "发放日期，格式 yyyy-MM-dd，识别不到给 null",
  "items": [
    { "materialName": "物料名", "qty": 数量（纯数字，不带单位） }
  ]
}

注意：
- qty 必须是 JSON number，不带单位、不用字符串
- 单据上有多行物料，items 要包含所有行
- 日期只写两位年份（如"26年8月2日"）一律理解成 20xx 年；完全没写年份就按 ${currentYear} 年，
  月、日照单据上的数字来，不要因为年份不确定就丢掉整个 date
- 完全看不清或者不是发料单，各字段给 null，items 给空数组`;
}

/** 每次调用都重新生成，年份用"现在" */
function buildOemReceiptSystemPrompt(): string {
  const currentYear = new Date().getFullYear();
  return `你是玩具加工厂的成品/半成品回收单据识别助手。用户会给你一张"回收单"（或叫领料单/还货单）的照片——
代工厂把加工好的成品/半成品交回来时开的单据，上面一般包含：代工厂名称、产品名称（可选）、日期、
若干行明细（货号或名称、重量(斤)、单个克重(g)、数量）——数量通常是靠重量除以单个克重换算出来的，
不是称出来的整数，所以单据上重量、克重、数量这三个数往往都会写。

只输出一个 JSON 对象，不要输出任何解释文字、不要用 markdown 代码块包裹，格式：

{
  "oemFactoryName": "代工厂名称，识别不到给 null",
  "productName": "产品名称，识别不到给 null",
  "date": "回收日期，格式 yyyy-MM-dd，识别不到给 null",
  "items": [
    {
      "skuOrName": "货号或名称（能看到货号优先填货号，看不到就填名称）",
      "weightJin": 重量数字（单位：斤，纯数字不带单位，没写就给 0）,
      "unitWeightG": 单个克重数字（单位：克，纯数字不带单位，没写就给 0）,
      "qtyDeclared": 单据上写的数量（纯数字），如果单据没有直接写数量就给 null
    }
  ]
}

注意：
- 数字字段必须是 JSON number，不带单位、不用字符串
- 单据上有多行明细，items 要包含所有行
- 日期只写两位年份（如"26年8月2日"）一律理解成 20xx 年；完全没写年份就按 ${currentYear} 年，
  月、日照单据上的数字来，不要因为年份不确定就丢掉整个 date
- 完全看不清或者不是回收单，各字段给 null，items 给空数组`;
}

/** 通义千问 VL（阿里云 DashScope）的 OCR Provider 实现 */
@Injectable()
export class QwenVlOcrProvider implements OcrProvider {
  private readonly logger = new Logger(QwenVlOcrProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async recognizeInboundImage(imagePath: string): Promise<OcrRawResult> {
    const content = await this.callQwenVl(imagePath, buildSystemPrompt(), '请识别这张入库单据图片，按要求的 JSON 格式输出。');
    if (content == null) return emptyResult();
    return parseResult(content, this.logger);
  }

  async recognizeMaterialDispatchImage(imagePath: string): Promise<MaterialDispatchOcrResult> {
    const content = await this.callQwenVl(
      imagePath,
      buildDispatchSystemPrompt(),
      '请识别这张发料单图片，按要求的 JSON 格式输出。',
    );
    if (content == null) return emptyDispatchResult();
    return parseDispatchResult(content, this.logger);
  }

  async recognizeOemReceiptImage(imagePath: string): Promise<OemReceiptOcrResult> {
    const content = await this.callQwenVl(
      imagePath,
      buildOemReceiptSystemPrompt(),
      '请识别这张成品/半成品回收单图片，按要求的 JSON 格式输出。',
    );
    if (content == null) return emptyOemReceiptResult();
    return parseOemReceiptResult(content, this.logger);
  }

  /** 调一次通义千问 VL，返回模型输出的文本；出错返回 null */
  private async callQwenVl(imagePath: string, systemPrompt: string, userText: string): Promise<string | null> {
    const apiKey = this.configService.get<string>('ocr.apiKey');
    if (!apiKey) {
      this.logger.warn('OCR_API_KEY 未配置，无法调用通义千问 VL，回退为空结果走人工录入');
      return null;
    }
    try {
      const imageDataUri = await toDataUri(imagePath);
      const model = this.configService.get<string>('ocr.model') || 'qwen-vl-plus';
      const response = await fetch(DASHSCOPE_ENDPOINT, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'image_url', image_url: { url: imageDataUri } },
                { type: 'text', text: userText },
              ],
            },
          ],
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`通义千问 VL 调用失败 (HTTP ${response.status}): ${errText}`);
        return null;
      }
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    } catch (err) {
      this.logger.error(`通义千问 VL 调用异常: ${(err as Error).message}`);
      return null;
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

function emptyDispatchResult(): MaterialDispatchOcrResult {
  return { oemFactoryName: null, productName: null, date: null, items: [] };
}

function parseDispatchResult(content: string, logger: Logger): MaterialDispatchOcrResult {
  try {
    const parsed = JSON.parse(extractJsonText(content)) as Partial<MaterialDispatchOcrResult>;
    const items: MaterialDispatchOcrItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it): it is MaterialDispatchOcrItem => !!it && typeof it === 'object')
          .map((it) => ({ materialName: toStr(it.materialName), qty: toNum(it.qty) }))
          .filter((it) => it.materialName)
      : [];
    return {
      oemFactoryName: parsed.oemFactoryName ? toStr(parsed.oemFactoryName) : null,
      productName: parsed.productName ? toStr(parsed.productName) : null,
      date: parsed.date ? toStr(parsed.date) : null,
      items,
    };
  } catch (err) {
    logger.error(`通义千问 VL 发料单返回不是合法 JSON: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyDispatchResult();
  }
}

function emptyOemReceiptResult(): OemReceiptOcrResult {
  return { oemFactoryName: null, productName: null, date: null, items: [] };
}

function parseOemReceiptResult(content: string, logger: Logger): OemReceiptOcrResult {
  try {
    const parsed = JSON.parse(extractJsonText(content)) as Partial<OemReceiptOcrResult>;
    const items: OemReceiptOcrItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it): it is OemReceiptOcrItem => !!it && typeof it === 'object')
          .map((it) => ({
            skuOrName: toStr(it.skuOrName),
            weightJin: toNum(it.weightJin),
            unitWeightG: toNum(it.unitWeightG),
            qtyDeclared: it.qtyDeclared == null ? null : toNum(it.qtyDeclared),
          }))
          .filter((it) => it.skuOrName)
      : [];
    return {
      oemFactoryName: parsed.oemFactoryName ? toStr(parsed.oemFactoryName) : null,
      productName: parsed.productName ? toStr(parsed.productName) : null,
      date: parsed.date ? toStr(parsed.date) : null,
      items,
    };
  } catch (err) {
    logger.error(`通义千问 VL 回收单返回不是合法 JSON: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyOemReceiptResult();
  }
}
