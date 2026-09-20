<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import InboundListView from "./InboundListView.vue";
import InboundReturnListView from "../inbound-return/InboundReturnListView.vue";
import InboundGalleryView from "./InboundGalleryView.vue";

// 入库、入库退货、单据相册这几个原来是分散的（或者根本没有），操作/查看流程都是围绕
// "入库单"这一件事，合并成一个页面用 tab 切换，减少侧边栏入口。各自的组件、接口、
// 数据结构完全不动，这里只是套一层 tab 壳。tab 状态放进 URL 的 query（而不是纯本地 ref），
// 这样"退货"/"相册"这些 tab 也能被直接分享/刷新保留在当前位置，不会一刷新就跳回"入库"
const route = useRoute();
const router = useRouter();

type TabName = "inbound" | "return" | "gallery";
const VALID_TABS: TabName[] = ["inbound", "return", "gallery"];

const activeTab = computed({
  get: () => (VALID_TABS.includes(route.query.tab as TabName) ? (route.query.tab as TabName) : "inbound"),
  set: (val: TabName) => {
    router.replace({ path: "/inbound", query: val === "inbound" ? {} : { tab: val } });
  },
});
</script>

<template>
  <el-tabs v-model="activeTab" class="hub-tabs">
    <el-tab-pane label="入库" name="inbound" lazy>
      <InboundListView />
    </el-tab-pane>
    <!-- 出库单（发料 + 退货）。tab 的 name 还是 "return"，是为了之前分享/收藏的
         ?tab=return 链接继续能用，显示的名字改成"出库" -->
    <el-tab-pane label="出库" name="return" lazy>
      <InboundReturnListView />
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
