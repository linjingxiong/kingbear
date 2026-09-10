/** 给代工厂发放物料的一条记录 */
export interface MaterialIssuance {
  id: string;
  oemFactoryId: string;
  materialId: string;
  qty: number;
  /** 发放日期，"YYYY-MM-DD" */
  issuedDate: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 列表展示用，带上代工厂/物料名称，不用前端再拿 id 反查一遍 */
export interface MaterialIssuanceListItem extends MaterialIssuance {
  oemFactoryName: string;
  materialName: string;
  unit: string;
}

export interface CreateMaterialIssuanceDto {
  oemFactoryId: string;
  materialId: string;
  qty: number;
  issuedDate: string;
  remark?: string;
}

export type UpdateMaterialIssuanceDto = Partial<CreateMaterialIssuanceDto>;
