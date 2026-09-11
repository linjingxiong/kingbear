/** 代工厂成品回收的一条记录：收了哪个代工厂、哪个产品、多少数量 */
export interface OemReceipt {
  id: string;
  oemFactoryId: string;
  productId: string;
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
  qty: number;
}
