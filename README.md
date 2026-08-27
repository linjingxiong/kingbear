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
