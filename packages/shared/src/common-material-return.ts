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
  /** 后端查出疑似重复数据会拦一次（409），人工确认过之后带上这个标记再提交一次，跳过检查 */
  force?: boolean;
}

export type UpdateCommonMaterialReturnDto = Partial<CreateCommonMaterialReturnDto>;
