// 直接改数据库里已有 admin 用户的密码。onModuleInit 那个自动建号逻辑只在 users 集合是空的
// 时候才生效，改 .env 的 ADMIN_PASSWORD 对已经存在的账号没有任何作用，所以要改密码只能
// 这样直接写库（用跟 auth.service.ts 里一样的 bcryptjs + 同样的 cost factor 10，保证生成的
// hash 跟登录时 bcrypt.compare 的校验方式完全对得上）。
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/kingbear';
const username = process.argv[2] || 'admin';
const newPassword = process.argv[3];

if (!newPassword) {
  console.error('用法: node set-admin-password.mjs <username> <new-password>');
  process.exit(1);
}

await mongoose.connect(uri);
const passwordHash = await bcrypt.hash(newPassword, 10);
const result = await mongoose.connection.collection('users').updateOne(
  { username },
  { $set: { passwordHash } },
);

if (result.matchedCount === 0) {
  console.error(`没找到用户 "${username}"`);
  process.exit(1);
}

console.log(`[set-admin-password] "${username}" 密码已更新`);
await mongoose.disconnect();
