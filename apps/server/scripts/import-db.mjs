// export-db.mjs 导出的 db-dump.json 导回一个新的 mongo 实例。用 EJSON 解析，
// ObjectId/Date 这些类型能正确还原，不会变成普通字符串。
import mongoose from 'mongoose';
import fs from 'fs/promises';

const { EJSON } = mongoose.mongo.BSON;
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kingbear';
const dumpFile = process.argv[2] || 'db-dump.json';

await mongoose.connect(uri);

const raw = await fs.readFile(dumpFile, 'utf-8');
const dump = EJSON.parse(raw);

for (const [name, docs] of Object.entries(dump)) {
  if (!docs.length) {
    console.log(`[import-db] ${name}: 0 条，跳过`);
    continue;
  }
  const collection = mongoose.connection.collection(name);
  await collection.deleteMany({});
  await collection.insertMany(docs);
  console.log(`[import-db] ${name}: 导入 ${docs.length} 条`);
}

console.log('[import-db] 完成');
await mongoose.disconnect();
