# 构建上下文必须是仓库根目录（因为要装 workspace 依赖 @kingbear/shared）：
#   docker build -f apps/server/Dockerfile -t kingbear-server .
FROM node:18-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/package.json
# --ignore-scripts：这一步只拷贝了各 package.json，还没拷源码，根 package.json 的
# postinstall（build:shared）这时候跑会因为 packages/shared 没有 tsconfig/src 而失败。
# shared 包的构建放到下面 build 阶段、源码拷进来之后再显式跑
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @kingbear/shared build && pnpm --filter @kingbear/server build

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/pnpm-workspace.yaml /repo/package.json ./
COPY --from=build /repo/packages/shared/package.json packages/shared/package.json
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/server/package.json apps/server/package.json
COPY --from=build /repo/apps/server/dist apps/server/dist
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter @kingbear/server...

WORKDIR /repo/apps/server
EXPOSE 3000
CMD ["node", "dist/main.js"]
