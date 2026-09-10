/** 代工厂：接收物料、加工后回收成品的外协厂，跟"玩具厂"（下单/收款方）是两回事 */
export interface OemFactory {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOemFactoryDto {
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
}

export type UpdateOemFactoryDto = Partial<CreateOemFactoryDto>;
