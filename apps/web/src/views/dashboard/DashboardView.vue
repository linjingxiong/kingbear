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
// 换个手机/浏览器要重选一次是可以接受的
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

// 近7天每天的加工数量条形图，用纯 CSS 画（不引入图表库）：每天的宽度是当天数量占
// 这7天里最大那天的百分比，最大那天始终画满，方便一眼看出节奏是升是降
const maxDailyQty = computed(() => {
  if (!overview.value) return 0;
  return Math.max(1, ...overview.value.week.daily.map((d) => d.qty));
});

function barWidth(qty: number) {
  return `${(qty / maxDailyQty.value) * 100}%`;
}

// 不引入 dayjs 的中文 locale（怕影响其它页面已经在用的默认英文 locale），
// 星期几直接手动映射
const WEEKDAY_NAMES = ["日", "一", "二", "三", "四", "五", "六"];
// 表格底部合计行：直接用 week 汇总的总数量/总金额，跟上面 bySku 各行加起来是同一个数，
// 不用在这里重新 reduce 一遍
function weekSkuSummary({ columns }: { columns: { property: string }[] }) {
  return columns.map((col, index) => {
    if (index === 0) return "合计";
    if (col.property === "qty") return overview.value?.week.processedQty.toLocaleString() ?? "";
    if (col.property === "amount") {
      return `¥${overview.value?.week.processedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) ?? ""}`;
    }
    return "";
  });
}

function weekdayLabel(date: string) {
  return `${dayjs(date).format("MM-DD")} 周${WEEKDAY_NAMES[dayjs(date).day()]}`;
}
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
              <!-- "今日"固定展示，第二栏在"近7天"/"本月"/"所有"之间切，不用三个都摆出来占地方 -->
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

      <!-- 手机上（:xs）两张卡片各占一整行，不再硬挤在一行里；卡片内部的小格子也是
           手机上两个一排（:xs="12"），桌面照旧一排排开 -->
      <el-row :gutter="16">
        <el-col :xs="24" :sm="12">
          <el-card>
            <template #header>今日数据</template>
            <el-row :gutter="12">
              <el-col :xs="12" :sm="8">
                <div class="stat-label">今日入库单数量</div>
                <div class="stat-value">{{ overview.today.inboundCount }}</div>
              </el-col>
              <el-col :xs="12" :sm="8">
                <div class="stat-label">今日加工数量</div>
                <div class="stat-value">{{ overview.today.processedQty }}</div>
              </el-col>
              <el-col :xs="12" :sm="8">
                <div class="stat-label">今日加工金额</div>
                <div class="stat-value">¥{{ overview.today.processedAmount.toFixed(2) }}</div>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-card>
            <template #header>本月数据</template>
            <el-row :gutter="12">
              <el-col :xs="12" :sm="6">
                <div class="stat-label">本月加工金额</div>
                <div class="stat-value">¥{{ overview.month.processedAmount.toFixed(2) }}</div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="stat-label">本月入库次数</div>
                <div class="stat-value">{{ overview.month.inboundCount }}</div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="stat-label">本月加工数量</div>
                <div class="stat-value">{{ overview.month.processedQty }}</div>
              </el-col>
              <el-col :xs="12" :sm="6">
                <div class="stat-label">未收款金额</div>
                <div class="stat-value warn">¥{{ overview.month.unpaidAmount.toFixed(2) }}</div>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
      </el-row>

      <!-- 近7天产能：滚动窗口（含今天往前数7天），跟自然周对不上没关系——平时说
           "7天内"指的就是这种滚动窗口，不然每周一都会有一天数据"消失"，看着莫名其妙 -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card>
            <template #header>近7天产能</template>
            <el-row :gutter="12" class="week-totals">
              <el-col :xs="12" :sm="8">
                <div class="stat-label">近7天加工数量</div>
                <div class="stat-value">{{ overview.week.processedQty.toLocaleString() }}</div>
              </el-col>
              <el-col :xs="12" :sm="8">
                <div class="stat-label">近7天加工金额</div>
                <div class="stat-value">¥{{ overview.week.processedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</div>
              </el-col>
              <el-col :xs="12" :sm="8">
                <div class="stat-label">近7天入库单数</div>
                <div class="stat-value">{{ overview.week.inboundCount }}</div>
              </el-col>
            </el-row>

            <!-- 每天一行，条形宽度按当天数量占这7天里最大那天的比例画，一眼看出节奏是升是降；
                 没有数据的日子条形是空的（宽度0），不是缺失了这一天 -->
            <div class="day-bars">
              <div v-for="d in overview.week.daily" :key="d.date" class="day-bar-row">
                <span class="day-bar-label">{{ weekdayLabel(d.date) }}</span>
                <div class="day-bar-track">
                  <div class="day-bar-fill" :style="{ width: barWidth(d.qty) }" />
                </div>
                <span class="day-bar-qty">{{ d.qty.toLocaleString() }}</span>
              </div>
            </div>
            <el-empty v-if="!overview.week.processedQty" description="近7天暂无加工数据" />

            <!-- 近7天汇总总数不分品类没意义（跟"本月加工数量明细"同一个道理），
                 这里按货号拆开列出各自的加工数量和金额 -->
            <template v-if="overview.week.bySku.length">
              <div class="week-sku-title">近7天按货号明细</div>
              <el-table :data="overview.week.bySku" size="default" show-summary :summary-method="weekSkuSummary">
                <el-table-column prop="sku" label="货号" width="140" />
                <el-table-column prop="name" label="名称" show-overflow-tooltip />
                <el-table-column prop="qty" label="近7天加工数量" align="right" width="160">
                  <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
                </el-table-column>
                <el-table-column prop="amount" label="近7天加工金额" align="right" width="160">
                  <template #default="{ row }">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
                </el-table-column>
              </el-table>
            </template>
          </el-card>
        </el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :xs="24" :sm="14">
          <el-card>
            <template #header>玩具厂排行（本月加工金额）</template>
            <el-table :data="overview.ranking" size="default">
              <el-table-column type="index" label="#" width="50" />
              <el-table-column prop="factoryName" label="玩具厂" />
              <el-table-column label="本月加工金额" align="right">
                <template #default="{ row }">¥{{ row.monthAmount.toFixed(2) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!overview.ranking.length" description="本月暂无数据" />
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="10">
          <el-card>
            <template #header>待处理提醒</template>
            <div class="alert-row">
              <span>待确认入库</span>
              <el-tag :type="overview.alerts.pendingConfirmCount ? 'warning' : 'info'">
                {{ overview.alerts.pendingConfirmCount }}
              </el-tag>
            </div>
            <div class="alert-row">
              <span>数量异常</span>
              <el-tag :type="overview.alerts.quantityDiffCount ? 'danger' : 'info'">
                {{ overview.alerts.quantityDiffCount }}
              </el-tag>
            </div>
            <div class="alert-row">
              <span>未收款账单</span>
              <el-tag :type="overview.alerts.unpaidBillCount ? 'warning' : 'info'">
                {{ overview.alerts.unpaidBillCount }}
              </el-tag>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- "本月加工数量"上面那个笼统的总数不同货号加一起没意义，这里按货号拆开列出来，
           才是真正能看的详情——跟应收账单里"按货号汇总不合并"是同一个原则 -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <el-card>
            <template #header>本月加工数量明细（按货号）</template>
            <el-table :data="overview.monthBySku" size="default">
              <el-table-column prop="sku" label="货号" width="140" />
              <el-table-column prop="name" label="名称" show-overflow-tooltip />
              <el-table-column label="本月加工数量" align="right" width="160">
                <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
              </el-table-column>
              <el-table-column label="本月加工金额" align="right" width="160">
                <template #default="{ row }">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
              </el-table-column>
            </el-table>
            <el-empty v-if="!overview.monthBySku.length" description="本月暂无数据" />
          </el-card>
        </el-col>
      </el-row>

      <!-- 按产品看加工情况，时间范围自己选，默认不限时间——跟上面"本月/近7天"那些
           固定周期的统计不一样，这块是让人自己挑一段时间灵活查 -->
      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :span="24">
          <ProductRangePanel />
        </el-col>
      </el-row>
    </template>

    <!-- 完整的应收账单，直接嵌在首页最下面，不用跳转 -->
    <div class="billing-embed">
      <BillingView />
    </div>
  </div>
</template>

<style scoped>
/* 只在手机宽度下出现——桌面端屏幕够宽，不需要把"关注货号"单独顶到最前面，
   跟其它卡片一起正常排就行 */
.featured-row {
  display: none;
}

@media (max-width: 767px) {
  .featured-row {
    display: block;
    margin-bottom: 16px;
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

.stat-label {
  color: #909399;
  font-size: 13px;
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
}

.stat-value.warn {
  color: #e6a23c;
}

.week-totals {
  margin-bottom: 16px;
}

.week-sku-title {
  margin-top: 20px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.day-bars {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.day-bar-label {
  flex: 0 0 110px;
  font-size: 13px;
  color: #606266;
}

.day-bar-track {
  flex: 1;
  height: 16px;
  background: #f0f2f5;
  border-radius: 3px;
  overflow: hidden;
}

.day-bar-fill {
  height: 100%;
  background: #409eff;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.day-bar-qty {
  flex: 0 0 64px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

.alert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 4px;
  border-bottom: 1px solid #f0f0f0;
}

.alert-row:last-child {
  border-bottom: none;
}

/* 手机上卡片从并排改成上下堆叠时，el-row 的 gutter 只管左右间距，
   这里手动给堆叠后的卡片补一个下边距，不然会贴在一起；多出来的最后一点
   间距不影响观感，比精确清除"最后一个"简单可靠 */
@media (max-width: 767px) {
  .dashboard :deep(.el-col) {
    margin-bottom: 16px;
  }
}

.billing-embed {
  margin-top: 16px;
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
