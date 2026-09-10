/**
 * 通用物料：跟具体产品无关、所有代工厂都可能用到的物料，比如"框"（装成品的容器）。
 * 不参与工钱/物料消耗的计算，只跟踪"发了多少、回收多少、还剩多少在代工厂手里"。
 */
export interface CommonMaterial {
  id: string;
  name: string;
  unit: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommonMaterialDto {
  name: string;
  unit: string;
  remark?: string;
}

export type UpdateCommonMaterialDto = Partial<CreateCommonMaterialDto>;
