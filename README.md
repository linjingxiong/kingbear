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
