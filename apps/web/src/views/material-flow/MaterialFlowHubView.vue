<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import MaterialIssuanceListView from "../material-issuance/MaterialIssuanceListView.vue";
import OemReceiptListView from "../oem-receipt/OemReceiptListView.vue";
import CommonMaterialReturnListView from "../common-material-return/CommonMaterialReturnListView.vue";
import OemReconciliationView from "../oem-reconciliation/OemReconciliationView.vue";

// 物料发放、成品回收、通用物料回收、物料对账，这四个原来是独立菜单项，都是围绕"代工厂
// 物料怎么发出去、怎么收回来"这一件事，合并成一个页面用 tab 切换。各自的组件、接口、
// 数据结构完全不动，这里只是套一层 tab 壳。tab 状态放进 URL 的 query，方便直接分享/刷新
// 保留在当前 tab，不会一刷新就跳回第一个
const route = useRoute();
const router = useRouter();

type TabName = "issuance" | "receipt" | "common-return" | "reconciliation";
const VALID_TABS: TabName[] = ["issuance", "receipt", "common-return", "reconciliation"];

const activeTab = computed({
  get: () => (VALID_TABS.includes(route.query.tab as TabName) ? (route.query.tab as TabName) : "issuance"),
  set: (val: TabName) => {
    router.replace({ path: "/material-flow", query: val === "issuance" ? {} : { tab: val } });
  },
});
</script>

<template>
  <el-tabs v-model="activeTab" class="hub-tabs">
    <el-tab-pane label="物料发放" name="issuance" lazy>
      <MaterialIssuanceListView />
    </el-tab-pane>
    <el-tab-pane label="成品回收" name="receipt" lazy>
      <OemReceiptListView />
    </el-tab-pane>
    <el-tab-pane label="通用物料回收" name="common-return" lazy>
      <CommonMaterialReturnListView />
    </el-tab-pane>
    <el-tab-pane label="物料对账" name="reconciliation" lazy>
      <OemReconciliationView />
    </el-tab-pane>
  </el-tabs>
</template>

<style scoped>
.hub-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}
</style>
