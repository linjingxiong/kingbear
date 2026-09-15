import { createApp } from "vue";
import { createPinia } from "pinia";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
// Element Plus 不设 locale 的话内置文案默认是英文——大部分地方不明显（都被自己的中文
// placeholder/label 盖过去了），但像 el-image 图片加载失败时的占位文字("FAILED"，之前
// 那个"附件"缩略图缩略图很小，裁出来看着像乱码"AILE...")这种没被覆盖的内置文案就会露出来。
// 全局配一下中文 locale，这些兜底文案就都是中文了。
import zhCn from "element-plus/es/locale/lang/zh-cn";
import * as ElementPlusIconsVue from "@element-plus/icons-vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);

for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.use(createPinia());
app.use(router);
app.use(ElementPlus, { locale: zhCn });
app.mount("#app");
