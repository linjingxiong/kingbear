<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import InboundDetailView from "./InboundDetailView.vue";
import InboundGalleryView from "./InboundGalleryView.vue";
import InboundCalendarView from "./InboundCalendarView.vue";

// 日历、明细（入库+出库合并）、单据相册，合成一个页面用 tab 切换，减少侧边栏入口。
// 原来入库/出库是两个平级 tab，日历排最后——现在反过来：日历是最常用的"按天看情况"
// 入口，放第一个、也是默认打开的；入库/出库合并成"明细"一个 tab（里面用类型切换），
// 不用再在两个长得很像的 tab 之间来回点。tab 状态放进 URL 的 query，刷新/分享链接
// 都能保留在当前位置。
//
// 旧链接兼容：以前 ?tab=inbound / ?tab=return 直接对应"入库"/"出库"两个独立 tab，
// 合并之后这两个旧值都转换成"明细"tab，再用哪个值带出"默认显示入库还是出库"
const route = useRoute();
const router = useRouter();

type TabName = "calendar" | "detail" | "gallery";
const VALID_TABS: TabName[] = ["calendar", "detail", "gallery"];
const LEGACY_DETAIL_KINDS = ["inbound", "return"] as const;

const activeTab = computed<TabName>({
  get: () => {
    const raw = route.query.tab as string | undefined;
    if (!raw) return "calendar";
    if ((LEGACY_DETAIL_KINDS as readonly string[]).includes(raw)) return "detail";
    return VALID_TABS.includes(raw as TabName) ? (raw as TabName) : "calendar";
  },
  set: (val) => {
    router.replace({ path: "/inbound", query: val === "calendar" ? {} : { tab: val } });
  },
});

// "明细"tab 默认显示入库还是出库：旧链接 ?tab=return 过来的就显示出库，其它情况
// （包括点"明细"tab 本身，name 就是 "detail"）默认显示入库
const detailKind = computed<"inbound" | "return">(() => (route.query.tab === "return" ? "return" : "inbound"));
</script>

<template>
  <el-tabs v-model="activeTab" class="hub-tabs">
    <el-tab-pane label="日历" name="calendar" lazy>
      <InboundCalendarView />
    </el-tab-pane>
    <el-tab-pane label="明细" name="detail" lazy>
      <InboundDetailView :initial-kind="detailKind" />
    </el-tab-pane>
    <el-tab-pane label="单据相册" name="gallery" lazy>
      <InboundGalleryView />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.hub-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
</style>
