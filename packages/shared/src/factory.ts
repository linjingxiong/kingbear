/** 玩具厂 */
export interface Factory {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FactoryListItem extends Factory {
  /** 产品数量（列表页聚合展示，非落库字段） */
  productCount: number;
  /** 累计加工金额（列表页聚合展示，非落库字段） */
  processedAmount: number;
}

export interface CreateFactoryDto {
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
}

export type UpdateFactoryDto = Partial<CreateFactoryDto>;
