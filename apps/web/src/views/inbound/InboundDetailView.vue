<script setup lang="ts">
import { ref, watch } from "vue";
import InboundListView from "./InboundListView.vue";
import InboundReturnListView from "../inbound-return/InboundReturnListView.vue";

// 入库、出库原来是两个平级 tab，现在合并成"明细"这一个 tab，用类型切换看哪一种——
// 两边各自的组件、筛选、弹窗完全不动，这里只是换了外层怎么切换。用 v-show 不用 v-if，
// 切换的时候两边各自的状态（筛选条件、未提交的草稿）不会被卸载掉，跟以前两个独立 tab
// 的体验一致（el-tabs 默认也是 v-show 保活）
const props = defineProps<{ initialKind?: "inbound" | "return"; filterDate?: string }>();
const kind = ref<"inbound" | "return">(props.initialKind ?? "inbound");
// 跟原来 el-tabs 的 lazy 行为一致：没点过的那一种不提前挂载、不提前发请求，
// 点过一次之后常驻（v-show），再切回去不用重新加载
const visited = ref<Set<"inbound" | "return">>(new Set([kind.value]));
watch(kind, (k) => visited.value.add(k));

watch(
  () => props.initialKind,
  (k) => {
    if (k) kind.value = k;
  },
);
</script>

<template>
  <div class="detail-page">
    <el-radio-group v-model="kind" class="detail-switch">
      <el-radio-button value="inbound">入库</el-radio-button>
      <el-radio-button value="return">出库</el-radio-button>
    </el-radio-group>
    <div v-if="visited.has('inbound')" v-show="kind === 'inbound'"><InboundListView :filter-date="filterDate" /></div>
    <div v-if="visited.has('return')" v-show="kind === 'return'"><InboundReturnListView :filter-date="filterDate" /></div>
  </div>
</template>

<style scoped>
.detail-switch {
  margin-bottom: 16px;
}
</style>
