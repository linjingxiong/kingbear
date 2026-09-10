/**
 * 产品：工序的父级。用户口径里"火龙果主体"是一个产品，239-1/239-2/239-3 是它的三道工序；
 * 系统里带"货号"的那一层（Product）其实是工序，这里的 ProductGroup 才是"产品"。
 * 属于某个玩具厂。物料清单直接录在产品身上，没有独立的全局物料目录。
 */
export interface ProductGroup {
  id: string;
  factoryId: string;
  name: string;
  remark?: string;
  /** 本产品用到的物料，新建产品时直接录入。工序配方、代工厂发料/对账都按这里的物料名来认。 */
  materials: ProductGroupMaterial[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductGroupMaterial {
  name: string;
  /** 计量单位，比如"斤""个""米"，选填（没填就是空字符串） */
  unit: string;
}

export interface CreateProductGroupDto {
  factoryId: string;
  name: string;
  remark?: string;
  materials?: ProductGroupMaterial[];
}

export type UpdateProductGroupDto = Partial<Omit<CreateProductGroupDto, "factoryId">>;
