import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    // 开发模式下 Vite 默认不会对 workspace 里链接进来的包做依赖预构建（只处理真正的
    // node_modules 三方包），@kingbear/shared 编译成的是 CommonJS，浏览器原生 ESM 没法
    // 直接 import 具名导出（枚举），报 "does not provide an export named"。强制把它纳入
    // 预构建，esbuild 会转成 ESM。
    include: ["@kingbear/shared"],
  },
  build: {
    commonjsOptions: {
      // pnpm workspace 里 @kingbear/shared 是符号链接，真实路径在 node_modules 之外，
      // Rollup 默认的 CJS 互操作探测只认 node_modules 下的文件，这里显式把它加进去，
      // 不然 shared 包里的枚举（InboundStatus 等运行时值）打包时会报 "is not exported by"
      include: [/packages\/shared/, /node_modules/],
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 开发环境：/api 和 /uploads 转发到本地跑的 NestJS（默认 3000 端口）
      "/api": { target: "http://localhost:3000", changeOrigin: true },
      "/uploads": { target: "http://localhost:3000", changeOrigin: true },
    },
  },
});
