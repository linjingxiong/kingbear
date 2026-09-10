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
}

export type UpdateOemReceiptDto = Partial<CreateOemReceiptDto>;
