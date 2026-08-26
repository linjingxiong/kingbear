// 把本地开发库（mongodb-memory-server 里的 kingbear 库）导出成一个 JSON 文件，
// 用 EJSON（BSON 扩展 JSON）保留 ObjectId/Date 这些类型，导入到别的 mongo 实例时不会
// 变成普通字符串。本地没有装 mongodump/mongorestore，所以用这个代替。
import mongoose from 'mongoose';

const { EJSON } = mongoose.mongo.BSON;
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kingbear';

await mongoose.connect(uri);
const collections = await mongoose.connection.db.listCollections().toArray();

const dump = {};
for (const { name } of collections) {
  const docs = await mongoose.connection.collection(name).find({}).toArray();
  dump[name] = docs;
  console.log(`[export-db] ${name}: ${docs.length} 条`);
}

const fs = await import('fs/promises');
await fs.writeFile('db-dump.json', EJSON.stringify(dump), 'utf-8');
console.log('[export-db] 已写入 db-dump.json');

await mongoose.disconnect();
