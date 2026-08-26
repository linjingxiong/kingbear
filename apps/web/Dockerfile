# 构建上下文必须是仓库根目录：docker build -f apps/web/Dockerfile -t kingbear-web .
FROM node:18-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
# --ignore-scripts：见 apps/server/Dockerfile 里的同款注释——这一步源码还没拷进来，
# 根 package.json 的 postinstall（build:shared）跑不了，shared 构建放到 build 阶段显式跑
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @kingbear/shared build && pnpm --filter @kingbear/web build

FROM nginx:alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
