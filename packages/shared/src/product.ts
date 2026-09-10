/** 一道工序里，某种物料的用量——物料从全局物料目录里选，配比手动录入 */
export interface ProcessStepMaterial {
  materialId: string;
  qty: number;
}

/** 工序：这个产品要经过哪几道工序、每道工序各耗多少物料，代工厂物料对账靠这个算耗料 */
export interface ProcessStep {
  name: string;
  materials: ProcessStepMaterial[];
}

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
  /** 加工工序 + 物料配方，代工厂成品回收后按这个算应耗物料 */
  processes: ProcessStep[];
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
  processes?: ProcessStep[];
}

export type UpdateProductDto = Partial<Omit<CreateProductDto, "factoryId">>;
