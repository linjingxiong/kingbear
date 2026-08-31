# 玩具加工管理系统

需求文档：[docs/requirements-v1.md](docs/requirements-v1.md)
架构设计：[docs/architecture.md](docs/architecture.md)

## 目录结构

```
apps/
  web/      # Vue3 + TS + Element Plus 前端
  server/   # NestJS + MongoDB 后端
packages/
  shared/   # 前后端共享的 TS 类型
docker-compose.yml
```

## 本地开发

前置要求：Node.js 18+、pnpm、本地或可访问的 MongoDB（默认 `mongodb://localhost:27017/kingbear`）。

```bash
# 1. 装依赖（会自动 build 一次 packages/shared，见根 package.json 的 postinstall）
pnpm install

# 2. 配置后端环境变量
cp apps/server/.env.example apps/server/.env
# 按需修改 MONGO_URI / ADMIN_USERNAME / ADMIN_PASSWORD 等

# 3. 启动后端（默认 3000 端口）
pnpm dev:server

# 4. 另开一个终端启动前端（默认 5173 端口，已配置 /api 代理到 3000）
pnpm dev:web
```

浏览器打开 `http://localhost:5173`。首次启动会自动创建管理员账号（用 `.env` 里的 `ADMIN_USERNAME`/`ADMIN_PASSWORD`，默认 `admin` / `admin123`，登录后请尽快修改）。

> 注意：`OCR_PROVIDER` 默认是 `stub`（占位实现），上传图片后不会真的识别内容，会走完整的人工兜底流程（选玩具厂、按公式算数量），用来联调整个入库确认流程。
>
> 接真实识别（通义千问 VL）：去 [DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)申请一个 API Key，改 `apps/server/.env`：
> ```
> OCR_PROVIDER=qwen-vl
> OCR_API_KEY=sk-你的key
> ```
> 重启后端即可，代码见 `apps/server/src/ocr/providers/qwen-vl-ocr.provider.ts`。以后要换 Claude / GPT-4V，照这个文件的样子加个新 Provider，在 `ocr.module.ts` 里加一个 `case` 就行。

## 修改 `packages/shared` 后

前后端共享的类型改了之后，要重新 build 一次共享包，改动才会生效：

```bash
pnpm build:shared
# 或者开发时开一个终端常驻 watch：
pnpm --filter @kingbear/shared dev
```

## 局域网部署（Docker Compose）

```bash
cp .env.example .env   # 按需修改
docker compose up -d --build
```

- `web` 容器（Nginx）监听 80 端口，反代 `/api`、`/uploads` 到 `server` 容器
- `server` 容器监听 3000 端口，入库单图片存到 `uploads_data` 卷
- `mongo` 数据持久化在 `mongo_data` 卷

局域网内其他电脑通过 `http://<部署机器的内网IP>` 访问即可，无需域名/证书。

> ⚠️ **`mongo` 不要把端口发布到公网**：之前发布过 `27017:27017` 又没配 mongod 账号密码，
> 结果被扫描工具连上去把整个库清空勒索过一次（详见 git 历史 `165e457` 那次修复）。
> `mongo` 只需要给同一个 compose 网络里的 `server` 容器用，`docker-compose.yml` 里现在是
> `expose`（只在容器网络内可见），不要为了"本机用工具连一下库"方便又改回 `ports` 映射。

## 数据库备份

之前被勒索软件清空过一次数据（见上面那条端口安全警告），光靠"以后不犯这个错"不够
可靠——误操作、脚本写错、磁盘故障都可能导致数据丢失，必须有独立的备份能拿回来。

`scripts/backup-mongo.sh` 用 `mongodump` 把整个库导出压缩包，存到宿主机上一个跟
`mongo_data` 这个 docker volume**完全无关**的目录（默认 `~/kingbear-backups`）——备份
不能跟数据库本体绑在一起，容器/卷被删的话备份也要跟着没了，那就白备份了。默认保留
最近 14 天，超期自动清理，不会一直攒到把硬盘占满。

部署机器上配置每天定时自动备份（一次即可，不用每次部署都重新配）：

```bash
chmod +x scripts/backup-mongo.sh scripts/restore-mongo.sh

# 手动跑一次，确认能正常导出
./scripts/backup-mongo.sh

# 配 cron，每天凌晨 3 点自动跑一次
(crontab -l 2>/dev/null; echo "0 3 * * * cd $(pwd) && ./scripts/backup-mongo.sh >> $HOME/kingbear-backups/backup.log 2>&1") | crontab -
```

需要恢复的时候：

```bash
./scripts/restore-mongo.sh ~/kingbear-backups/kingbear-20260831-030000.archive.gz
```

会先清空当前数据库里的集合，再导入备份里的数据，操作前脚本会让你二次确认。

### 异地备份：同步到 GitHub

本地备份解决"误删/脚本写错"，但服务器本身出问题（磁盘坏、被删、欠费回收）的话本地
备份会一起没，所以每次备份还会额外导出一份（不含 `users` 集合，那里面是管理员密码
的哈希，没必要公开）推到这个仓库的 `backups` 分支——这个仓库当前是 **public
仓库，这份数据是公开的**，是权衡过"简单、不用管密钥密码"之后做出的明确决定，
不是默认推荐做法；如果这个仓库以后改成 private，这一步不用改就自动跟着变成私有。

首次配置（只需要在部署机器上做一次）：

```bash
# 1. 生成专用的部署密钥（只给这一个仓库推送用，不是账号密码）
ssh-keygen -t ed25519 -f ~/.ssh/kingbear_backup_deploy_key -N '' -C 'kingbear-backup-deploy-key'
cat ~/.ssh/kingbear_backup_deploy_key.pub
```

把打印出来的公钥加到 GitHub 仓库 Settings → Deploy keys → Add deploy key，**勾选
"Allow write access"**。然后：

```bash
cat >> ~/.ssh/config << 'EOF'

Host github-kingbear-backup
  HostName github.com
  User git
  IdentityFile ~/.ssh/kingbear_backup_deploy_key
  IdentitiesOnly yes
EOF

# 2. 建一个单独的 clone，切到孤立的 backups 分支（不带 main 的代码提交历史）
git clone --branch main --single-branch https://github.com/linjingxiong/kingbear.git ~/kingbear-backups-git
cd ~/kingbear-backups-git
git remote set-url origin git@github-kingbear-backup:linjingxiong/kingbear.git
git checkout --orphan backups && git rm -rf . && mkdir backups
git commit --allow-empty -m init && git push -u origin backups
```

配好之后 `backup-mongo.sh` 每次跑都会自动把最新一份（去掉 `users`）提交推送到这个
分支，不需要再手动干预。`~/kingbear-backups-git` 不存在的话这一步会跳过，只做
本地备份，不会报错。

## 忘记管理员密码怎么办

这是单管理员账号的系统，没有邮箱/短信找回那一套。改 `.env` 的 `ADMIN_PASSWORD` 对已经
存在的账号不起作用（那个值只在 `users` 集合是空的时候，启动时自动建号才会用到）。
要改已存在账号的密码，直接在数据库里改，脚本已经写好了：

```bash
# 把脚本拷进正在跑的 server 容器
sudo docker cp apps/server/scripts/set-admin-password.mjs kingbear-git-server-1:/repo/apps/server/

# 在容器里跑，改成想要的新密码
sudo docker exec kingbear-git-server-1 sh -c \
  'cd /repo/apps/server && MONGO_URI=mongodb://mongo:27017/kingbear node set-admin-password.mjs admin 新密码'

# 跑完记得把临时拷进容器的脚本删掉
sudo docker exec kingbear-git-server-1 rm /repo/apps/server/set-admin-password.mjs
```

容器名、`MONGO_URI` 如果你的部署跟 `docker-compose.yml` 里的服务名不一样，改成对应的即可。
