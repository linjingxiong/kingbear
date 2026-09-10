/**
 * 给代工厂发放物料的一条记录。
 * - 产品物料：productGroupId 有值，物料按"产品 + 物料名"标识
 * - 通用物料（框等）：productGroupId 为空，物料按名字标识（对应通用物料目录）
 */
export interface MaterialIssuance {
  id: string;
  oemFactoryId: string;
  productGroupId?: string;
  materialName: string;
  qty: number;
  /** 发放日期，"YYYY-MM-DD" */
  issuedDate: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 列表展示用，带上代工厂/产品名称和物料单位，不用前端再拿 id 反查一遍 */
export interface MaterialIssuanceListItem extends MaterialIssuance {
  oemFactoryName: string;
  /** 产品物料是产品名；通用物料是"通用物料" */
  productGroupName: string;
  unit: string;
}

export interface CreateMaterialIssuanceDto {
  oemFactoryId: string;
  /** 通用物料发放时留空 */
  productGroupId?: string;
  materialName: string;
  qty: number;
  issuedDate: string;
  remark?: string;
}

export type UpdateMaterialIssuanceDto = Partial<CreateMaterialIssuanceDto>;
