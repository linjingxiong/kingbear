// 视觉模型返回的文本解析成结构化结果——各家模型用的 provider 名字不一样（打日志用），
// 解析逻辑和兜底规则跟调用的是哪个模型无关，共用这一份

import type { Logger } from '@nestjs/common';
import type {
  MaterialDispatchOcrItem,
  MaterialDispatchOcrResult,
  OcrRawItem,
  OcrRawResult,
  OemReceiptOcrItem,
  OemReceiptOcrResult,
  OutboundIssueOcrItem,
  OutboundIssueOcrResult,
} from '../ocr.types';

/** 模型偶尔会用 ```json 代码块包一层，或者混杂几句解释文字，这里尽量把 JSON 主体抠出来 */
export function extractJsonText(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw.trim();
  return raw.slice(start, end + 1);
}

export function toStr(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function toNum(value: unknown): number {
  const num = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(num) ? num : 0;
}

export function emptyResult(): OcrRawResult {
  return { factoryName: null, date: null, items: [] };
}

export function emptyDispatchResult(): MaterialDispatchOcrResult {
  return { oemFactoryName: null, productName: null, date: null, items: [] };
}

export function emptyOutboundIssueResult(): OutboundIssueOcrResult {
  return { factoryName: null, date: null, items: [] };
}

export function emptyOemReceiptResult(): OemReceiptOcrResult {
  return { oemFactoryName: null, productName: null, date: null, items: [] };
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

export function parseResult(content: string, logger: Logger, providerLabel: string): OcrRawResult {
  try {
    const parsed = JSON.parse(extractJsonText(content)) as Partial<OcrRawResult>;
    return normalize(parsed);
  } catch (err) {
    logger.error(`${providerLabel} 返回内容不是合法 JSON，回退为空结果: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyResult();
  }
}

export function parseDispatchResult(content: string, logger: Logger, providerLabel: string): MaterialDispatchOcrResult {
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
    logger.error(`${providerLabel} 发料单返回不是合法 JSON: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyDispatchResult();
  }
}

export function parseOutboundIssueResult(content: string, logger: Logger, providerLabel: string): OutboundIssueOcrResult {
  try {
    const parsed = JSON.parse(extractJsonText(content)) as Partial<OutboundIssueOcrResult>;
    const items: OutboundIssueOcrItem[] = Array.isArray(parsed.items)
      ? parsed.items
          .filter((it): it is OutboundIssueOcrItem => !!it && typeof it === 'object')
          .map((it) => ({ materialName: toStr(it.materialName), weightJin: toNum(it.weightJin) }))
          .filter((it) => it.materialName)
      : [];
    return {
      factoryName: parsed.factoryName ? toStr(parsed.factoryName) : null,
      date: parsed.date ? toStr(parsed.date) : null,
      items,
    };
  } catch (err) {
    logger.error(`${providerLabel} 出库发料单返回不是合法 JSON: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyOutboundIssueResult();
  }
}

export function parseOemReceiptResult(content: string, logger: Logger, providerLabel: string): OemReceiptOcrResult {
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
    logger.error(`${providerLabel} 回收单返回不是合法 JSON: ${(err as Error).message}\n原始返回: ${content}`);
    return emptyOemReceiptResult();
  }
}
