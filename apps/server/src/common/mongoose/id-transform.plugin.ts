import { Schema } from 'mongoose';

/**
 * 全局 Mongoose 插件：JSON 序列化时把 _id 转成 id（字符串），去掉 __v。
 *
 * packages/shared 里所有实体类型（Factory / Product / InboundRecord...）用的都是 `id` 字段，
 * 不加这个转换的话接口原样返回 Mongoose 的 `_id`，前端下拉框/编辑按钮全部因为拿不到 `id` 而失效
 * （表现就是"选了玩具厂但提交不上去"——绑定的其实一直是 undefined）。
 */
export function idTransformPlugin(schema: Schema) {
  schema.set('toJSON', {
    transform: (_doc, ret: Record<string, unknown> & { _id?: unknown; __v?: unknown }) => {
      ret.id = (ret._id as { toString(): string })?.toString?.() ?? ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}
