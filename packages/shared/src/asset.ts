/** 资产盘点：公司资产的领用登记，谁领的、领了什么、放哪、什么时候领的、凭证图片 */
export interface Asset {
  id: string;
  /** 资产管理人（领用人） */
  custodian: string;
  name: string;
  qty: number;
  location: string;
  /** 领用时间，"YYYY-MM-DD" */
  checkoutDate: string;
  /** 领用凭证：收据、签字单等照片，可以不止一张 */
  images: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetDto {
  custodian: string;
  name: string;
  qty: number;
  location: string;
  checkoutDate: string;
  images?: string[];
}

export type UpdateAssetDto = Partial<CreateAssetDto>;
