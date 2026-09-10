/**
 * 产品：工序的父级。用户口径里"火龙果主体"是一个产品，239-1/239-2/239-3 是它的三道工序；
 * 现在系统里带"货号"的那一层（Product）其实是工序，这里的 ProductGroup 才是"产品"。
 * 属于某个玩具厂，跟工序一样按玩具厂划分。
 */
export interface ProductGroup {
  id: string;
  factoryId: string;
  name: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductGroupDto {
  factoryId: string;
  name: string;
  remark?: string;
}

export type UpdateProductGroupDto = Partial<Omit<CreateProductGroupDto, "factoryId">>;
