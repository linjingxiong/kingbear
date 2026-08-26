<script setup lang="ts">
import { onMounted, ref } from "vue";
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
