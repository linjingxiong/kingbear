<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import dayjs from "dayjs";
import type { DashboardOverview } from "@kingbear/shared";
import { getDashboardOverview } from "../../api/dashboard";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
// 直接把完整的应收账单页面嵌进首页，不用再跳转过去——首页往下滚就是它，
// 玩具厂/账期选择、tab、明细这些原样保留，跟单独打开应收账单页是同一个组件
import BillingView from "../billing/BillingView.vue";
import ProductRangePanel from "./ProductRangePanel.vue";

const overview = ref<DashboardOverview | null>(null);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    overview.value = await getDashboardOverview();
  } finally {
    loading.value = false;
  }
}

// "关注货号"：手机端登录后优先看到的实时加工数据，选哪些货号是用户自己定的
// （比如现在关心的火龙果那几个货号），不写死在代码里，以后关注的品类变了不用改代码。
// 选择结果存在这台设备的浏览器里——这是纯粹的个人使用偏好，不是要跨设备同步的业务数据，
// 换个手机/浏览器要重选一次是可以接受的。这次重新设计只换皮肤，是否只在手机端显示这个
// 既有安排不变。
const FEATURED_SKUS_KEY = "kingbear-featured-skus";
const featuredSkus = ref<string[]>([]);
const productOptions = ref<{ sku: string; name: string }[]>([]);

function loadFeaturedSkus() {
  try {
    const raw = localStorage.getItem(FEATURED_SKUS_KEY);
    if (raw) featuredSkus.value = JSON.parse(raw);
  } catch {
    // 存的内容读不出来就当没选过，不影响正常使用
  }
}

watch(featuredSkus, (skus) => {
  try {
    localStorage.setItem(FEATURED_SKUS_KEY, JSON.stringify(skus));
  } catch {
    // 存不进去（比如隐私模式）就算了，不影响本次使用
  }
});

// 货号选择器的候选项：全部玩具厂的产品档案取一遍货号+名称去重，不依赖"最近有没有加工过"——
// 刚建档还没排产的新货号也要能选
async function loadProductOptions() {
  const factories = await listFactories();
  const productLists = await Promise.all(factories.map((f) => listProductsByFactory(f.id)));
  const skuMap = new Map<string, string>();
  for (const list of productLists) {
    for (const p of list) skuMap.set(p.sku, p.name);
  }
  productOptions.value = [...skuMap.entries()].map(([sku, name]) => ({ sku, name }));
}

// "今日"固定展示，第二个时间口径在"近7天"/"本月"/"所有"（不限时间的累计）之间切换——
// 平时盯近7天的节奏，月底想核对本月总量就切"本月"，偶尔想看看这个货号总共做了多少
// 就切到"所有"，不用三个都摆出来占地方
const featuredRange = ref<"week" | "month" | "all">("week");

const FEATURED_RANGE_LABELS = { week: "近7天", month: "本月", all: "所有" } as const;
const featuredRangeLabel = computed(() => FEATURED_RANGE_LABELS[featuredRange.value]);

// 关注货号卡片同时展示"今日"和当前选中的时间口径，各自按选中的货号从对应的
// bySku 明细里筛出来；没有加工记录的货号（比如刚选中还没排产）数量金额都是0，不是漏了
const featuredRows = computed(() => {
  if (!overview.value) return [];
  const rangeBySku = {
    week: overview.value.week.bySku,
    month: overview.value.monthBySku,
    all: overview.value.allTimeBySku,
  }[featuredRange.value];
  return featuredSkus.value.map((sku) => {
    const name =
      productOptions.value.find((p) => p.sku === sku)?.name ??
      rangeBySku.find((s) => s.sku === sku)?.name ??
      sku;
    const today = overview.value!.today.bySku.find((s) => s.sku === sku);
    const range = rangeBySku.find((s) => s.sku === sku);
    return {
      sku,
      name,
      todayQty: today?.qty ?? 0,
      todayAmount: today?.amount ?? 0,
      rangeQty: range?.qty ?? 0,
      rangeAmount: range?.amount ?? 0,
    };
  });
});

onMounted(() => {
  loadFeaturedSkus();
  load();
  loadProductOptions();
});

const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];

// ---- 顶部问候语条：纯装饰性的开场白 + 待处理提醒小计，图标随白天/夜晚变化 ----
const greeting = computed(() => {
  const h = dayjs().hour();
  if (h < 6) return "夜深了";
  if (h < 11) return "早安";
  if (h < 14) return "午安";
  if (h < 18) return "下午好";
  return "晚上好";
});
const isDaytime = computed(() => {
  const h = dayjs().hour();
  return h >= 6 && h < 18;
});
const todayLabel = computed(() => `${dayjs().format("YYYY年MM月DD日")} 星期${WEEKDAY_NAMES[dayjs().day()]}`);

const alertsTotal = computed(() => {
  const a = overview.value?.alerts;
  if (!a) return 0;
  return a.pendingConfirmCount + a.quantityDiffCount + a.unpaidBillCount;
});

// ---- KPI 四联卡：今日/本月最要紧的几个数字，一眼扫过去，不用再挨个卡片找 ----
const kpiCards = computed(() => {
  const o = overview.value;
  return [
    {
      key: "todayQty",
      label: "今日加工数量",
      value: (o?.today.processedQty ?? 0).toLocaleString(),
      icon: "Box",
      cls: "kpi-rose",
    },
    {
      key: "todayAmount",
      label: "今日加工金额",
      value: `¥${(o?.today.processedAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: "Money",
      cls: "kpi-purple",
    },
    {
      key: "monthAmount",
      label: "本月加工金额",
      value: `¥${(o?.month.processedAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: "TrendCharts",
      cls: "kpi-blue",
    },
    {
      key: "unpaid",
      label: "本月未收款",
      value: `¥${(o?.month.unpaidAmount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
      icon: "Wallet",
      cls: "kpi-orange",
    },
  ];
});

// ---- 近7天加工趋势：手写 SVG 面积图，不引入图表库。viewBox 尺寸和容器的 CSS
//      aspect-ratio 保持同一比例，hover 提示框才能用百分比精确定位到对应的点上 ----
const CHART_W = 600;
const CHART_H = 220;
const CHART_PAD = { top: 16, right: 12, bottom: 28, left: 8 };
const hoverIndex = ref<number | null>(null);

const weekChart = computed(() => {
  const daily = overview.value?.week.daily ?? [];
  const innerW = CHART_W - CHART_PAD.left - CHART_PAD.right;
  const innerH = CHART_H - CHART_PAD.top - CHART_PAD.bottom;
  const maxQty = Math.max(1, ...daily.map((d) => d.qty));
  const step = daily.length > 1 ? innerW / (daily.length - 1) : 0;
  const points = daily.map((d, i) => ({
    x: CHART_PAD.left + i * step,
    y: CHART_PAD.top + innerH - (d.qty / maxQty) * innerH,
    date: d.date,
    qty: d.qty,
    amount: d.amount,
  }));
  const bottomY = CHART_PAD.top + innerH;
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = points.length
    ? `M${points[0].x},${bottomY} ${points.map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${bottomY} Z`
    : "";
  // 4档横向网格线（含0刻度），左侧标数值，方便对着看某天大概是多少
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((r) => ({
    y: CHART_PAD.top + innerH * (1 - r),
    label: Math.round(maxQty * r),
  }));
  return { points, linePath, areaPath, gridLines, bottomY };
});

const hoveredPoint = computed(() => (hoverIndex.value === null ? null : (weekChart.value.points[hoverIndex.value] ?? null)));

function xLabel(date: string) {
  return dayjs(date).format("MM-DD");
}

function chartDayLabel(date: string) {
  return `${dayjs(date).format("MM-DD")} 周${WEEKDAY_NAMES[dayjs(date).day()]}`;
}

// ---- 玩具厂占比环形图：本月加工金额用纯 CSS conic-gradient 画甜甜圈，不引入图表库；
//      超过5家的话只画前5家+"其他"合并一份，图例不至于太长 ----
const DONUT_COLORS = ["#409eff", "#8e6ee6", "#f7b955", "#4fd1a5", "#f5716b", "#c0c4cc"];

const donut = computed(() => {
  const ranking = overview.value?.ranking ?? [];
  const top = ranking.slice(0, 5);
  const restAmount = ranking.slice(5).reduce((s, r) => s + r.monthAmount, 0);
  const rows = restAmount > 0 ? [...top, { factoryId: "__rest", factoryName: "其他", monthAmount: restAmount }] : top;
  const total = rows.reduce((s, r) => s + r.monthAmount, 0);
  let cumulative = 0;
  const segments = rows.map((r, i) => {
    const pct = total > 0 ? (r.monthAmount / total) * 100 : 0;
    const start = cumulative;
    cumulative += pct;
    return { ...r, pct, start, end: cumulative, color: DONUT_COLORS[i % DONUT_COLORS.length] };
  });
  const gradient = segments.length
    ? `conic-gradient(${segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ")})`
    : "conic-gradient(#f0f2f5 0% 100%)";
  return { segments, total, gradient };
});
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <template v-if="overview">
      <!-- 关注货号：只在手机宽度下显示，摆在整个首页最上面——手机登录一般是出门在外
           临时看一眼进度，最关心的就是自己勾的这几个货号今天/近7天做了多少，
           不想还要往下翻过好几张卡片才看到。桌面端不受影响，照常隐藏。 -->
      <el-row class="featured-row">
        <el-col :span="24">
          <el-card class="featured-card">
            <template #header>
              <div class="featured-header">
                <span>关注货号 · 实时加工</span>
                <el-select
                  v-model="featuredSkus"
                  multiple
                  filterable
                  collapse-tags
                  collapse-tags-tooltip
                  placeholder="选择要关注的货号"
                  size="small"
                  style="max-width: 220px"
                >
                  <el-option v-for="p in productOptions" :key="p.sku" :label="`${p.sku} · ${p.name}`" :value="p.sku" />
                </el-select>
              </div>
            </template>
            <template v-if="featuredRows.length">
              <el-radio-group v-model="featuredRange" size="small" class="featured-range">
                <el-radio-button value="week">7天</el-radio-button>
                <el-radio-button value="month">本月</el-radio-button>
                <el-radio-button value="all">所有</el-radio-button>
              </el-radio-group>
              <div v-for="row in featuredRows" :key="row.sku" class="featured-sku-row">
                <div class="featured-sku-name">{{ row.sku }} · {{ row.name }}</div>
                <div class="featured-sku-stats">
                  <div class="featured-stat">
                    <span class="featured-stat-label">今日</span>
                    <span class="featured-stat-value">{{ row.todayQty.toLocaleString() }}</span>
                    <span class="featured-stat-amount">¥{{ row.todayAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
                  </div>
                  <div class="featured-stat">
                    <span class="featured-stat-label">{{ featuredRangeLabel }}</span>
                    <span class="featured-stat-value">{{ row.rangeQty.toLocaleString() }}</span>
                    <span class="featured-stat-amount">¥{{ row.rangeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</span>
                  </div>
                </div>
              </div>
            </template>
            <el-empty v-else description="还没选要关注的货号，点右上角选一下" :image-size="60" />
          </el-card>
        </el-col>
      </el-row>

      <!-- 问候语条：装饰性开场白 + 待处理提醒小计，一打开首页就知道今天要不要处理点什么 -->
      <div class="hero-banner">
        <div class="hero-left">
          <div class="hero-icon">
            <el-icon :size="26"><component :is="isDaytime ? 'Sunny' : 'Moon'" /></el-icon>
          </div>
          <div>
            <div class="hero-greeting">
              {{ greeting }}！{{ alertsTotal ? `今天有 ${alertsTotal} 项待处理事项` : "今天的数据一切正常" }}
            </div>
            <div class="hero-date">{{ todayLabel }}</div>
          </div>
        </div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-value">{{ overview.today.processedQty.toLocaleString() }}</div>
            <div class="hero-stat-label">今日加工</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value">{{ overview.today.inboundCount }}</div>
            <div class="hero-stat-label">今日入库</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-value" :class="{ warn: alertsTotal }">{{ alertsTotal }}</div>
            <div class="hero-stat-label">待处理</div>
          </div>
        </div>
      </div>

      <!-- KPI 四联卡：今日/本月最要紧的几个数字，颜色区分不同指标，一眼扫过去 -->
      <div class="kpi-grid">
        <div v-for="k in kpiCards" :key="k.key" class="kpi-card" :class="k.cls">
          <div class="kpi-icon"><el-icon :size="18"><component :is="k.icon" /></el-icon></div>
          <div class="kpi-label">{{ k.label }}</div>
          <div class="kpi-value">{{ k.value }}</div>
          <el-icon class="kpi-bg-icon" :size="64"><component :is="k.icon" /></el-icon>
        </div>
      </div>

      <!-- 图表行：左边近7天加工趋势面积图，右边本月玩具厂占比环形图；都是纯 CSS/SVG
           手写的，没有引入图表库，避免多一个前端依赖要装 -->
      <div class="chart-row">
        <el-card class="chart-card">
          <template #header>
            <div class="section-title">近7天加工趋势</div>
          </template>
          <div class="area-chart-wrap">
            <svg :viewBox="`0 0 ${CHART_W} ${CHART_H}`" class="area-chart" preserveAspectRatio="xMidYMid meet">
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#409eff" stop-opacity="0.35" />
                  <stop offset="100%" stop-color="#409eff" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <line
                v-for="g in weekChart.gridLines"
                :key="g.y"
                :x1="CHART_PAD.left"
                :x2="CHART_W - CHART_PAD.right"
                :y1="g.y"
                :y2="g.y"
                class="chart-grid-line"
              />
              <text v-for="g in weekChart.gridLines" :key="`t${g.y}`" :x="0" :y="g.y - 3" class="chart-grid-label">{{ g.label }}</text>
              <path :d="weekChart.areaPath" fill="url(#areaFill)" />
              <path :d="weekChart.linePath" fill="none" stroke="#409eff" stroke-width="2.5" />
              <line
                v-if="hoveredPoint"
                :x1="hoveredPoint.x"
                :x2="hoveredPoint.x"
                :y1="CHART_PAD.top"
                :y2="weekChart.bottomY"
                class="chart-hover-line"
              />
              <g v-for="(p, i) in weekChart.points" :key="p.date">
                <circle
                  :cx="p.x"
                  :cy="p.y"
                  :r="hoverIndex === i ? 5 : 3.5"
                  fill="#fff"
                  stroke="#409eff"
                  stroke-width="2"
                  class="chart-point"
                  @mouseenter="hoverIndex = i"
                  @mouseleave="hoverIndex = null"
                />
                <text :x="p.x" :y="weekChart.bottomY + 18" class="chart-x-label">{{ xLabel(p.date) }}</text>
              </g>
            </svg>
            <div
              v-if="hoveredPoint"
              class="chart-tooltip"
              :style="{ left: `${(hoveredPoint.x / CHART_W) * 100}%`, top: `${(hoveredPoint.y / CHART_H) * 100}%` }"
            >
              <div class="chart-tooltip-date">{{ chartDayLabel(hoveredPoint.date) }}</div>
              <div>数量 {{ hoveredPoint.qty.toLocaleString() }}</div>
              <div>金额 ¥{{ hoveredPoint.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</div>
            </div>
          </div>
          <el-empty v-if="!overview.week.processedQty" description="近7天暂无加工数据" :image-size="60" />
        </el-card>

        <el-card class="chart-card donut-card">
          <template #header>
            <div class="section-title">本月玩具厂占比</div>
          </template>
          <template v-if="donut.segments.length">
            <div class="donut-wrap">
              <div class="donut-circle" :style="{ background: donut.gradient }">
                <div class="donut-hole">
                  <div class="donut-hole-value">¥{{ donut.total.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</div>
                  <div class="donut-hole-label">本月合计</div>
                </div>
              </div>
              <div class="donut-legend">
                <div v-for="s in donut.segments" :key="s.factoryId" class="donut-legend-row">
                  <span class="donut-dot" :style="{ background: s.color }" />
                  <span class="donut-legend-name">{{ s.factoryName }}</span>
                  <span class="donut-legend-value">¥{{ s.monthAmount.toLocaleString(undefined, { maximumFractionDigits: 0 }) }}</span>
                  <span class="donut-legend-pct">{{ s.pct.toFixed(0) }}%</span>
                </div>
              </div>
            </div>
          </template>
          <el-empty v-else description="本月暂无数据" :image-size="60" />
        </el-card>
      </div>

      <!-- 按产品/工序看加工数量明细，时间范围自己挑（今日/近7天/本月/全部快捷按钮），
           详细数字都在这一块查，上面的图表只负责让人一眼看到大概走势 -->
      <ProductRangePanel />

      <!-- 待处理提醒：三项都用图标+颜色区分，有数字才高亮，一眼看出要不要管 -->
      <el-card>
        <template #header>
          <div class="section-title">待处理提醒</div>
        </template>
        <div class="alerts-grid">
          <div class="alert-item" :class="{ active: overview.alerts.pendingConfirmCount }">
            <el-icon :size="22"><Files /></el-icon>
            <div class="alert-text">
              <div class="alert-count">{{ overview.alerts.pendingConfirmCount }}</div>
              <div class="alert-label">待确认入库</div>
            </div>
          </div>
          <div class="alert-item danger" :class="{ active: overview.alerts.quantityDiffCount }">
            <el-icon :size="22"><WarningFilled /></el-icon>
            <div class="alert-text">
              <div class="alert-count">{{ overview.alerts.quantityDiffCount }}</div>
              <div class="alert-label">数量异常</div>
            </div>
          </div>
          <div class="alert-item warn" :class="{ active: overview.alerts.unpaidBillCount }">
            <el-icon :size="22"><Wallet /></el-icon>
            <div class="alert-text">
              <div class="alert-count">{{ overview.alerts.unpaidBillCount }}</div>
              <div class="alert-label">未收款账单</div>
            </div>
          </div>
        </div>
      </el-card>
    </template>

    <!-- 完整的应收账单，直接嵌在首页最下面，不用跳转 -->
    <div class="billing-embed">
      <div class="section-title standalone">应收账单</div>
      <BillingView />
    </div>
  </div>
</template>

<style scoped>
/* 统一这一页所有卡片（包括嵌进来的 ProductRangePanel / BillingView 内部的卡片）的
   圆角/阴影/内边距，看起来是同一套设计，不是东拼西凑 */
.dashboard :deep(.el-card) {
  border: none;
  border-radius: 12px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
}

.dashboard :deep(.el-card__header) {
  border-bottom: 1px solid #f2f3f5;
  padding: 14px 20px;
}

.dashboard :deep(.el-card__body) {
  padding: 20px;
}

.dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 小标题：左边一条色块 + 加粗文字，卡片头部和"应收账单"这种独立分隔标题都用它，
   让整页的分节方式统一 */
.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}

.section-title::before {
  content: "";
  width: 4px;
  height: 14px;
  background: #409eff;
  border-radius: 2px;
}

.section-title.standalone {
  margin: 8px 0 4px;
}

/* 只在手机宽度下出现——桌面端屏幕够宽，不需要把"关注货号"单独顶到最前面，
   跟其它卡片一起正常排就行 */
.featured-row {
  display: none;
}

@media (max-width: 767px) {
  .featured-row {
    display: block;
  }
}

.featured-card :deep(.el-card__header) {
  padding: 12px 16px;
}

.featured-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.featured-range {
  margin-bottom: 8px;
}

.featured-sku-row {
  padding: 10px 0;
  border-bottom: 1px solid #f0f0f0;
}

.featured-sku-row:last-child {
  border-bottom: none;
}

.featured-sku-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 6px;
}

.featured-sku-stats {
  display: flex;
  gap: 24px;
}

.featured-stat {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.featured-stat-label {
  font-size: 12px;
  color: #909399;
}

.featured-stat-value {
  font-size: 16px;
  font-weight: 600;
}

.featured-stat-amount {
  font-size: 12px;
  color: #67c23a;
}

/* ---- 问候语条 ---- */
.hero-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, #eef4ff 0%, #f3eefe 100%);
}

.hero-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hero-icon {
  flex-shrink: 0;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #409eff, #79bbff);
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.35);
}

.hero-greeting {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.hero-date {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

.hero-stats {
  display: flex;
  gap: 28px;
}

.hero-stat {
  text-align: center;
}

.hero-stat-value {
  font-size: 20px;
  font-weight: 700;
  color: #303133;
  font-variant-numeric: tabular-nums;
}

.hero-stat-value.warn {
  color: #e6a23c;
}

.hero-stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

/* ---- KPI 四联卡 ---- */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

@media (max-width: 991px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 420px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}

.kpi-card {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  padding: 18px 20px;
  color: #fff;
  min-height: 92px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
}

.kpi-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kpi-label {
  font-size: 13px;
  opacity: 0.92;
}

.kpi-value {
  font-size: 21px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.kpi-bg-icon {
  position: absolute;
  right: 10px;
  bottom: 4px;
  opacity: 0.18;
}

.kpi-rose {
  background: linear-gradient(135deg, #f66b97, #e6467f);
}

.kpi-purple {
  background: linear-gradient(135deg, #9a7be0, #6f5cd6);
}

.kpi-blue {
  background: linear-gradient(135deg, #4fc3f7, #3d9be0);
}

.kpi-orange {
  background: linear-gradient(135deg, #ffb75e, #ed8f3f);
}

/* ---- 图表行 ---- */
.chart-row {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 16px;
  align-items: stretch;
}

@media (max-width: 991px) {
  .chart-row {
    grid-template-columns: 1fr;
  }
}

.area-chart-wrap {
  position: relative;
}

.area-chart {
  width: 100%;
  aspect-ratio: 600 / 220;
  display: block;
  overflow: visible;
}

.chart-grid-line {
  stroke: #f0f2f5;
  stroke-width: 1;
}

.chart-grid-label {
  font-size: 10px;
  fill: #c0c4cc;
}

.chart-x-label {
  font-size: 10px;
  fill: #909399;
  text-anchor: middle;
}

.chart-point {
  cursor: pointer;
  transition: r 0.15s ease;
}

.chart-hover-line {
  stroke: #dcdfe6;
  stroke-dasharray: 3, 3;
}

.chart-tooltip {
  position: absolute;
  transform: translate(-50%, -120%);
  background: #303133;
  color: #fff;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.6;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 2;
}

.chart-tooltip-date {
  font-weight: 600;
  margin-bottom: 2px;
}

/* ---- 环形图 ---- */
.donut-card :deep(.el-card__body) {
  display: flex;
  align-items: center;
}

.donut-wrap {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;
}

.donut-circle {
  flex-shrink: 0;
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.donut-hole {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.donut-hole-value {
  font-size: 14px;
  font-weight: 700;
  color: #303133;
}

.donut-hole-label {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.donut-legend {
  flex: 1;
  min-width: 160px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.donut-legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.donut-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.donut-legend-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #606266;
}

.donut-legend-value {
  color: #303133;
  font-weight: 600;
}

.donut-legend-pct {
  color: #909399;
  width: 36px;
  text-align: right;
}

/* ---- 待处理提醒 ---- */
.alerts-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 640px) {
  .alerts-grid {
    grid-template-columns: 1fr;
  }
}

.alert-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  background: #f8f9fb;
  color: #b0b3b8;
}

.alert-item.active {
  color: #409eff;
  background: rgba(64, 158, 255, 0.08);
}

.alert-item.danger.active {
  color: #f56c6c;
  background: rgba(245, 108, 108, 0.08);
}

.alert-item.warn.active {
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.08);
}

.alert-text {
  display: flex;
  flex-direction: column;
}

.alert-count {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.alert-label {
  font-size: 12px;
  color: #909399;
}

.billing-embed {
  margin-top: 4px;
}

/* 嵌进首页之后就不是页面唯一内容了，BillingView 自己那套"撑满剩余视口高度"
   （height:100% + flex）在这里没有意义，反而可能因为拿不到确定的父级高度而
   显得奇怪；直接清掉，让它按内容自身高度显示，跟首页其它卡片一样正常往下排 */
.billing-embed :deep(.billing-page) {
  height: auto;
  display: block;
}

.billing-embed :deep(.statement-card) {
  display: block;
}

.billing-embed :deep(.statement-card .el-card__body) {
  display: block;
}
</style>
