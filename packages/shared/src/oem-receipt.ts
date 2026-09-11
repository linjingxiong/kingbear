/**
 * 代工厂成品回收的一条记录：收了哪个代工厂、哪个产品、多少数量。
 * 跟入库单一样，数量是"重量(斤) ÷ 单个克重(g)"换算出来的，不是称重直接数出来的整数——
 * weightJin/unitWeightG/qtyDeclared 是原始三个数，qty 是最终数量（qtyDeclared 有填就用它，
 * 没填就用公式算出来的），算法见 quantity.ts 的 calculateQuantity。
 */
export interface OemReceipt {
  id: string;
  oemFactoryId: string;
  productId: string;
  /** 重量（斤），手工录入没称重的话可以是 0 */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 单据/识别到的数量，没有就是 null，由 qty 按公式兜底 */
  qtyDeclared: number | null;
  /** 最终数量：qtyDeclared ?? calculateQuantity(weightJin, unitWeightG) */
  qty: number;
  /** 回收日期，"YYYY-MM-DD" */
  receivedDate: string;
  /** 回收凭证图片，可以不止一张 */
  images: string[];
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 列表展示用，带上代工厂/产品名称，不用前端再拿 id 反查一遍 */
export interface OemReceiptListItem extends OemReceipt {
  oemFactoryName: string;
  productSku: string;
  productName: string;
}

export interface CreateOemReceiptDto {
  oemFactoryId: string;
  productId: string;
  weightJin?: number;
  unitWeightG?: number;
  qtyDeclared?: number | null;
  qty: number;
  receivedDate: string;
  images?: string[];
  remark?: string;
}

export type UpdateOemReceiptDto = Partial<CreateOemReceiptDto>;

/** 回收单 OCR 识别结果（POST /oem-receipts/recognize 返回，再带上 imageUrl） */
export interface OemReceiptOcrResult {
  imageUrl: string;
  oemFactoryName: string | null;
  productName: string | null;
  date: string | null;
  items: OemReceiptOcrItem[];
}

export interface OemReceiptOcrItem {
  /** 识别到的货号或名称，不一定跟系统里的工序精确对得上，前端按名字/货号模糊匹配 */
  skuOrName: string;
  /** 重量（斤） */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 单据上写的数量，没写就 null，前端按公式算 */
  qtyDeclared: number | null;
}
