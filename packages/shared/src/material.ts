/** 物料（零件）：全局共用的一份目录，产品的工序配方从这里面选，不同代工厂/产品共用同一批定义 */
export interface Material {
  id: string;
  name: string;
  /** 计量单位，比如"个""米""克" */
  unit: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMaterialDto {
  name: string;
  unit: string;
  remark?: string;
}

export type UpdateMaterialDto = Partial<CreateMaterialDto>;
