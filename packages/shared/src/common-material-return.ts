/** 代工厂归还通用物料（比如把空框还回来）的一条记录 */
export interface CommonMaterialReturn {
  id: string;
  oemFactoryId: string;
  commonMaterialName: string;
  qty: number;
  /** 归还日期，"YYYY-MM-DD" */
  returnedDate: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommonMaterialReturnListItem extends CommonMaterialReturn {
  oemFactoryName: string;
  unit: string;
}

export interface CreateCommonMaterialReturnDto {
  oemFactoryId: string;
  commonMaterialName: string;
  qty: number;
  returnedDate: string;
  remark?: string;
}

export type UpdateCommonMaterialReturnDto = Partial<CreateCommonMaterialReturnDto>;
