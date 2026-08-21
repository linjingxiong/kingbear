// 本地开发用的一次性 MongoDB：不需要额外装 MongoDB Server 或 Docker。
// 首次运行会自动下载一份 mongod 二进制（有缓存，之后启动很快）。
// 数据落在 apps/server/.mongo-data，重启这个脚本数据不会丢。
import { MongoMemoryServer } from 'mongodb-memory-server';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', '.mongo-data');
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: {
    port: 27017,
    dbPath,
    dbName: 'kingbear',
  },
});

console.log(`[dev-mongo] 已启动，监听 ${mongod.getUri()}`);
console.log('[dev-mongo] Ctrl+C 停止');

process.on('SIGINT', async () => {
  await mongod.stop();
  process.exit(0);
});
