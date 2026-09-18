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
# 官方镜像自带的这个入口脚本会跑 `apk manifest nginx` 去跟默认配置文件的校验和比对，
# 决定要不要自动往配置里塞一行 IPv6 监听——这台服务器上这一步会莫名卡死（复现了两次，
# 不是偶发的），CPU/磁盘 IO 都是空的，像是卡在某个系统调用上，一直等不到超时。我们自己的
# nginx.conf 是完整的静态配置，不需要这个自动改写功能，直接删掉这个脚本绕开这个坑
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
