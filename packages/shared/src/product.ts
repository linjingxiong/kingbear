/** 产品（属于某个玩具厂） */
export interface Product {
  id: string;
  factoryId: string;
  /** 货号 */
  sku: string;
  name: string;
  /** 工厂价：玩具厂支付给我们的加工价格（元/个） */
  factoryPrice: number;
  /** 加工价：外放加工支付价格（元/个），第一版不参与利润计算 */
  processPrice?: number;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductDto {
  factoryId: string;
  sku: string;
  name: string;
  factoryPrice: number;
  processPrice?: number;
  remark?: string;
}

export type UpdateProductDto = Partial<Omit<CreateProductDto, "factoryId">>;
