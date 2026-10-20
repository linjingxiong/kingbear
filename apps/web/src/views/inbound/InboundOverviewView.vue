<script setup lang="ts">
import { ref } from "vue";
import InboundCalendarView from "./InboundCalendarView.vue";
import InboundDetailView from "./InboundDetailView.vue";

// 日历和明细放在同一屏：左边日历，右边（窄屏下是下面）跟着联动的明细列表——点日历上
// 某一天，右边的入库/出库列表直接按这天筛好，不用再跳一次 tab、也不用弹窗盖住页面。
// 再点一下同一天 = 取消筛选，明细恢复显示当月全部
const props = defineProps<{ initialKind?: "inbound" | "return" }>();
const selectedDate = ref("");

function onSelectDate(date: string) {
  selectedDate.value = selectedDate.value === date ? "" : date;
}
</script>

<template>
  <div class="overview-layout">
    <div class="overview-calendar">
      <InboundCalendarView :selected-date="selectedDate" @select-date="onSelectDate" />
    </div>
    <div class="overview-detail">
      <div v-if="selectedDate" class="date-filter-bar">
        <span>只看 <b>{{ selectedDate }}</b> 这天的记录</span>
        <el-button size="small" text type="primary" @click="selectedDate = ''">清除，看全部</el-button>
      </div>
      <InboundDetailView :initial-kind="props.initialKind" :filter-date="selectedDate" />
    </div>
  </div>
</template>

<style scoped>
.overview-layout {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.overview-calendar {
  flex: 0 0 340px;
}

.overview-detail {
  flex: 1;
  min-width: 0;
}

.date-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: rgba(64, 158, 255, 0.08);
  font-size: 13px;
  color: #303133;
}

@media (max-width: 991px) {
  .overview-layout {
    flex-direction: column;
  }
  .overview-calendar {
    flex: none;
    width: 100%;
  }
  .overview-detail {
    width: 100%;
  }
}
</style>
