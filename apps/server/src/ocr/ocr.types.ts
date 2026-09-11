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

/** 发料单识别结果：发给哪个代工厂、哪个产品、日期、一列物料和数量 */
export interface MaterialDispatchOcrResult {
  /** 代工厂名称，识别失败给 null */
  oemFactoryName: string | null;
  /** 产品名称，识别失败给 null */
  productName: string | null;
  /** 发放日期，yyyy-MM-dd，识别失败给 null */
  date: string | null;
  items: MaterialDispatchOcrItem[];
}

export interface MaterialDispatchOcrItem {
  /** 物料名 */
  materialName: string;
  /** 发放数量 */
  qty: number;
}

/** 成品/半成品回收单识别结果：哪个代工厂交回的、哪个产品、日期、一列货号/名称和数量 */
export interface OemReceiptOcrResult {
  oemFactoryName: string | null;
  productName: string | null;
  date: string | null;
  items: OemReceiptOcrItem[];
}

export interface OemReceiptOcrItem {
  /** 识别到的货号或名称，不一定跟系统里的工序精确对得上，调用方按名字/货号模糊匹配 */
  skuOrName: string;
  qty: number;
}

/** OCR Provider 统一接口：换供应商（Claude / GPT-4V / 通义千问VL...）只用改这一层的实现 */
export interface OcrProvider {
  /** imagePath 是图片在本地磁盘上的真实路径（不是对外的 /uploads URL） */
  recognizeInboundImage(imagePath: string): Promise<OcrRawResult>;
  /** 发料单识别 */
  recognizeMaterialDispatchImage(imagePath: string): Promise<MaterialDispatchOcrResult>;
  /** 成品/半成品回收单识别 */
  recognizeOemReceiptImage(imagePath: string): Promise<OemReceiptOcrResult>;
}
