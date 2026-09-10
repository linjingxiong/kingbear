/** 这道工序（货号）用某种物料的用量——物料从全局物料目录里选，配比手动录入 */
export interface ProductMaterial {
  materialId: string;
  qty: number;
}

/**
 * "产品"（Product）这个实体其实是用户口径里的"工序"——带货号的这一层。
 * 每条工序归属到一个 ProductGroup（用户说的"产品"），属于某个玩具厂。
 * 物料配方（零件+配比）直接挂在工序上，代工厂成品回收后按这个算应耗物料。
 */
export interface Product {
  id: string;
  factoryId: string;
  /** 所属产品（ProductGroup）。历史数据可能还没归集，所以是可选的 */
  productGroupId?: string;
  /** 货号 */
  sku: string;
  name: string;
  /** 工厂价：玩具厂支付给我们的加工价格（元/个） */
  factoryPrice: number;
  /** 加工价：外放加工支付价格（元/个），第一版不参与利润计算 */
  processPrice?: number;
  remark?: string;
  /** 物料配方：这道工序耗哪些物料、各耗多少 */
  materials: ProductMaterial[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  factoryId: string;
  productGroupId?: string;
  sku: string;
  name: string;
  factoryPrice: number;
  processPrice?: number;
  remark?: string;
  materials?: ProductMaterial[];
}

export type UpdateProductDto = Partial<Omit<CreateProductDto, "factoryId">>;
