// 一次性脚本：把已经入库确认过的历史记录里，每一行的 hasQuantityDiff 按新的"相差超过 1%"
// 标准重新算一遍存回去。改用新标准之前确认的记录，存的还是旧标准（数量跟计算值只要不完全
// 相等就算差异）算出来的结果，跑一遍这个脚本让首页的"数量差异"提醒数量跟入库管理/应收账单
// 里现算的结果对得上。之后新入库确认/修改都会自动用新标准存，不需要再跑这个脚本。
import mongoose from 'mongoose';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kingbear';
const BIG_QTY_DIFF_RATIO = 0.01;

function calculateQuantity(weightJin, unitWeightG) {
  if (!unitWeightG || unitWeightG <= 0) return 0;
  return Math.round((weightJin * 500) / unitWeightG);
}

function hasBigQuantityDiff(qty, calculated) {
  if (!calculated) return qty > 0;
  return Math.abs(qty - calculated) / calculated > BIG_QTY_DIFF_RATIO;
}

await mongoose.connect(uri);
const collection = mongoose.connection.collection('inboundRecords');

const cursor = collection.find({});
let checked = 0;
let changed = 0;

for await (const doc of cursor) {
  checked++;
  let dirty = false;
  const items = (doc.items ?? []).map((item) => {
    const calculated = calculateQuantity(item.weightJin, item.unitWeightG);
    const nextDiff = hasBigQuantityDiff(item.qtyFinal, calculated);
    if (nextDiff !== item.hasQuantityDiff) dirty = true;
    return { ...item, hasQuantityDiff: nextDiff };
  });
  if (dirty) {
    await collection.updateOne({ _id: doc._id }, { $set: { items } });
    changed++;
  }
}

console.log(`[backfill-qty-diff] 检查了 ${checked} 条入库记录，更新了 ${changed} 条`);
await mongoose.disconnect();
