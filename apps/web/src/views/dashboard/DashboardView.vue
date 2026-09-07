<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import type { DashboardOverview } from "@kingbear/shared";
import { getDashboardOverview } from "../../api/dashboard";
// 直接把完整的应收账单页面嵌进首页，不用再跳转过去——首页往下滚就是它，
// 玩具厂/账期选择、tab、明细这些原样保留，跟单独打开应收账单页是同一个组件
import BillingView from "../billing/BillingView.vue";

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

onMounted(load);

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
function weekdayLabel(date: string) {
  return `${dayjs(date).format("MM-DD")} 周${WEEKDAY_NAMES[dayjs(date).day()]}`;
}
</script>

<template>
  <div v-loading="loading" class="dashboard">
    <template v-if="overview">
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
    </template>

    <!-- 完整的应收账单，直接嵌在首页最下面，不用跳转 -->
    <div class="billing-embed">
      <BillingView />
    </div>
  </div>
</template>

<style scoped>
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
