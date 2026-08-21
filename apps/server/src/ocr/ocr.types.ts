/** 要求大模型按这个 JSON Schema 返回入库单识别结果 */
export interface OcrRawResult {
  /** 玩具厂名称，识别失败给 null */
  factoryName: string | null;
  /** 入库日期，ISO 格式（yyyy-MM-dd），识别失败给 null，由调用方兜底成当天 */
  date: string | null;
  items: OcrRawItem[];
}

export interface OcrRawItem {
  sku: string;
  name: string;
  /** 重量（斤） */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 单据上写的数量，如果单据没写就给 null，由调用方按公式计算 */
  qtyDeclared: number | null;
}

/** OCR Provider 统一接口：换供应商（Claude / GPT-4V / 通义千问VL...）只用改这一层的实现 */
export interface OcrProvider {
  /** imagePath 是图片在本地磁盘上的真实路径（不是对外的 /uploads URL） */
  recognizeInboundImage(imagePath: string): Promise<OcrRawResult>;
}
