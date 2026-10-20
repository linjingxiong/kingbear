<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import type { FactoryListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { searchInbound, getInboundGallery } from "../../api/inbound";
import { listInboundReturns } from "../../api/inbound-return";

// 日历：一眼看出这个月哪几天没录入库/出库单——比翻列表、一行行对日期快得多。
// 今天之前、选中玩具厂（或全部）那天既没有入库记录也没有出库记录，就标红提醒"可能漏录了"；
// 今天以及还没到的日子不算"漏录"，正常显示，不然每个月后半段全是红的，没意义。
//
// "有入库/有出库"是数据库里有没有这条记录（哪怕是手工录入、没拍照的），"有单据"是单独
// 一个维度——有没有拍单据原图留底（跟"单据相册"同一个判断口径：没拍照的记录不算）。
//
// 纯展示组件：点一天只是把这天的日期报给父组件（InboundOverviewView），具体这天有哪些
// 入库/出库记录、怎么编辑/新增，都交给旁边联动的"明细"去做，这里不管
const props = defineProps<{ selectedDate?: string }>();
const emit = defineEmits<{ (e: "select-date", date: string): void }>();

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref("");
const month = ref(dayjs().format("YYYY-MM"));
const loading = ref(false);

const inboundDates = ref<Set<string>>(new Set());
const outboundDates = ref<Set<string>>(new Set());
const documentDates = ref<Set<string>>(new Set());

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
const todayStr = dayjs().format("YYYY-MM-DD");
const monthLabel = computed(() => dayjs(`${month.value}-01`).format("YYYY年MM月"));
const isCurrentMonth = computed(() => month.value === dayjs().format("YYYY-MM"));

type CalendarCell = { date: string | null };

// 周日开头的整月格子，前后补空格凑成完整的周，跟常见日历控件的排法一致
const calendarCells = computed<CalendarCell[]>(() => {
  const start = dayjs(`${month.value}-01`);
  const daysInMonth = start.daysInMonth();
  const leading = start.day();
  const cells: CalendarCell[] = [];
  for (let i = 0; i < leading; i++) cells.push({ date: null });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ date: start.date(d).format("YYYY-MM-DD") });
  while (cells.length % 7 !== 0) cells.push({ date: null });
  return cells;
});

function cellStatus(date: string) {
  const hasIn = inboundDates.value.has(date);
  const hasOut = outboundDates.value.has(date);
  const hasDoc = documentDates.value.has(date);
  return { hasIn, hasOut, hasDoc, missing: date <= todayStr && !hasIn && !hasOut };
}

function dayNum(date: string) {
  return Number(date.slice(8, 10));
}

async function load() {
  loading.value = true;
  try {
    const dateFrom = `${month.value}-01`;
    const dateTo = dayjs(dateFrom).endOf("month").format("YYYY-MM-DD");
    const [inboundResult, outboundList, galleryItems] = await Promise.all([
      searchInbound({ factoryId: factoryId.value || undefined, dateFrom, dateTo, pageSize: 2000 }),
      listInboundReturns(),
      getInboundGallery({ factoryId: factoryId.value || undefined, yearMonth: month.value }),
    ]);
    inboundDates.value = new Set(inboundResult.list.map((r) => (r.inboundDate ?? "").slice(0, 10)).filter(Boolean));
    outboundDates.value = new Set(
      outboundList
        .filter((r) => (!factoryId.value || r.factoryId === factoryId.value) && r.returnDate.slice(0, 7) === month.value)
        .map((r) => r.returnDate.slice(0, 10)),
    );
    documentDates.value = new Set(galleryItems.map((g) => (g.inboundDate ?? "").slice(0, 10)).filter(Boolean));
  } finally {
    loading.value = false;
  }
}

function prevMonth() {
  month.value = dayjs(`${month.value}-01`).subtract(1, "month").format("YYYY-MM");
  load();
}
function nextMonth() {
  month.value = dayjs(`${month.value}-01`).add(1, "month").format("YYYY-MM");
  load();
}
function backToday() {
  month.value = dayjs().format("YYYY-MM");
  load();
}

onMounted(async () => {
  factories.value = await listFactories();
  // 默认优先选"美奇"，列表里没有的话就不选，当"全部玩具厂"处理
  const preferred = factories.value.find((f) => f.name === "美奇");
  if (preferred) factoryId.value = preferred.id;
  load();
});
</script>

<template>
  <div v-loading="loading" class="calendar-page">
    <div class="filter-bar">
      <el-select v-model="factoryId" placeholder="全部玩具厂" clearable filterable size="small" style="width: 150px" @change="load">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <div class="month-nav">
        <el-button circle size="small" @click="prevMonth"><el-icon><ArrowLeft /></el-icon></el-button>
        <span class="month-label">{{ monthLabel }}</span>
        <el-button circle size="small" @click="nextMonth"><el-icon><ArrowRight /></el-icon></el-button>
      </div>
      <el-button v-if="!isCurrentMonth" size="small" text type="primary" @click="backToday">回到本月</el-button>
    </div>

    <div class="legend">
      <span class="legend-item"><i class="dot dot-in" />入库</span>
      <span class="legend-item"><i class="dot dot-out" />出库</span>
      <span class="legend-item"><i class="dot dot-doc" />单据照片</span>
      <span class="legend-item"><i class="dot dot-missing" />疑似漏录</span>
    </div>

    <div class="calendar-grid">
      <div v-for="w in WEEKDAY_NAMES" :key="w" class="weekday-cell">{{ w }}</div>
      <template v-for="(cell, i) in calendarCells" :key="i">
        <div v-if="!cell.date" class="day-cell day-cell--empty" />
        <div
          v-else
          class="day-cell"
          :class="{
            'day-cell--missing': cellStatus(cell.date).missing,
            'day-cell--today': cell.date === todayStr,
            'day-cell--selected': cell.date === props.selectedDate,
          }"
          @click="emit('select-date', cell.date)"
        >
          <div class="day-num">{{ dayNum(cell.date) }}</div>
          <div class="day-tags">
            <span v-if="cellStatus(cell.date).hasIn" class="day-tag day-tag--in">入</span>
            <span v-if="cellStatus(cell.date).hasOut" class="day-tag day-tag--out">出</span>
            <span v-if="cellStatus(cell.date).hasDoc" class="day-tag day-tag--doc">单</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.month-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.month-label {
  font-size: 14px;
  font-weight: 600;
  min-width: 80px;
  text-align: center;
}

.legend {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
  font-size: 12px;
  color: #909399;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.dot-in {
  background: #67c23a;
}

.dot-out {
  background: #409eff;
}

.dot-doc {
  background: #e6a23c;
}

.dot-missing {
  background: #f56c6c;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.weekday-cell {
  text-align: center;
  font-size: 11px;
  color: #909399;
  padding-bottom: 4px;
}

.day-cell {
  min-height: 44px;
  border-radius: 6px;
  background: #f8f9fb;
  padding: 4px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.day-cell:not(.day-cell--empty):hover {
  background: #eef3fb;
}

.day-cell--empty {
  background: transparent;
  cursor: default;
}

.day-cell--today {
  outline: 2px solid #409eff;
  outline-offset: -2px;
}

.day-cell--selected {
  background: #409eff;
}

.day-cell--selected .day-num {
  color: #fff;
}

.day-cell--missing {
  background: rgba(245, 108, 108, 0.1);
}

.day-cell--missing:hover {
  background: rgba(245, 108, 108, 0.16);
}

.day-cell--missing .day-num {
  color: #f56c6c;
  font-weight: 700;
}

.day-num {
  font-size: 12px;
  font-weight: 600;
  color: #303133;
}

.day-tags {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
}

.day-tag {
  font-size: 10px;
  line-height: 1.4;
  padding: 0 3px;
  border-radius: 3px;
  color: #fff;
}

.day-tag--in {
  background: #67c23a;
}

.day-tag--out {
  background: #409eff;
}

.day-tag--doc {
  background: #e6a23c;
}
</style>
