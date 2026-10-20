<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import InboundOverviewView from "./InboundOverviewView.vue";
import InboundGalleryView from "./InboundGalleryView.vue";

// 出入库（日历+明细合并一屏）、单据相册，合成一个页面用 tab 切换，减少侧边栏入口。
// 日历和明细原来是两个要来回点的平级 tab，现在并成一屏——日历在左，点哪天右边的
// 入库/出库明细就跟着筛到哪天，不用再切 tab。整个页面从原来 4 个平级 tab
//（入库/出库/单据相册/日历）减到 2 个。tab 状态放进 URL 的 query，刷新/分享链接
// 都能保留在当前位置。
//
// 旧链接兼容：以前 ?tab=inbound / ?tab=return / ?tab=detail / ?tab=calendar 分别对应
// 入库、出库、明细、日历这几个独立 tab，现在统统并进"出入库"这一个 tab，
// ?tab=return 这种还额外带出"默认显示出库而不是入库"
const route = useRoute();
const router = useRouter();

type TabName = "overview" | "gallery";

const activeTab = computed<TabName>({
  get: () => (route.query.tab === "gallery" ? "gallery" : "overview"),
  set: (val) => {
    router.replace({ path: "/inbound", query: val === "overview" ? {} : { tab: val } });
  },
});

// "出入库"里的明细默认显示入库还是出库：旧链接 ?tab=return 过来的就显示出库
const detailKind = computed<"inbound" | "return">(() => (route.query.tab === "return" ? "return" : "inbound"));
</script>

<template>
  <el-tabs v-model="activeTab" class="hub-tabs">
    <el-tab-pane label="出入库" name="overview" lazy>
      <InboundOverviewView :initial-kind="detailKind" />
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
