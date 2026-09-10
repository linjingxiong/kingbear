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
  /** 本产品会用到的物料（从全局物料目录里选的一批）。下面工序配方的物料只能从这里面挑。 */
  materialIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductGroupDto {
  factoryId: string;
  name: string;
  remark?: string;
  materialIds?: string[];
}

export type UpdateProductGroupDto = Partial<Omit<CreateProductGroupDto, "factoryId">>;
