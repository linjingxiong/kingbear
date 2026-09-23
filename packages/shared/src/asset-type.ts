/**
 * 资产类型：资产盘点"资产名称"的目录，比如"笔记本电脑""打印机"。跟通用物料是同一个思路——
 * 单独维护一份名录，资产领用记录里存的还是名字字符串，不引用这张表的 id。
 */
export interface AssetType {
  id: string;
  name: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetTypeDto {
  name: string;
  remark?: string;
}

export type UpdateAssetTypeDto = Partial<CreateAssetTypeDto>;
