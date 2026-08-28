<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  BillPaymentStatus,
  calculateQuantity,
  hasBigQuantityDiff,
  type BillingDetailRow,
  type BillingSummary,
  type FactoryListItem,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { getBillingSummary, updatePaymentStatus } from "../../api/billing";

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref<string>("");
const yearMonth = ref<string>(dayjs().format("YYYY-MM"));
const summary = ref<BillingSummary | null>(null);
const loading = ref(false);

/** 下面按货号切换的 tab；空字符串是"全部"这个 tab */
const skuFilter = ref("");

/** 账期下拉：最近 12 个月，不用日期选择器那一套 */
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));

/** 左边明细表跟着 tab 联动——选了具体货号就只看这个货号的流水，"全部"就是全部流水 */
const filteredDetails = computed(() => {
  if (!summary.value) return [];
  if (!skuFilter.value) return summary.value.details;
  return summary.value.details.filter((d) => d.sku === skuFilter.value);
});

async function loadFactories() {
  factories.value = await listFactories();
  if (!factoryId.value && factories.value.length) {
    // 默认优先选"美奇"，列表里没有的话（比如换了环境）再退回选第一个，不会白屏选不出来
    const preferred = factories.value.find((f) => f.name === "美奇");
    factoryId.value = (preferred ?? factories.value[0]).id;
  }
}

// 跟入库确认页、入库管理列表用同一份"相差超过 5 个算异常"的标准，账单上金额算得再准，
// 源头数量本身就录错的话也要能看出来
function isBigQtyDiff(row: BillingDetailRow) {
  return hasBigQuantityDiff(row.qty, calculateQuantity(row.weightJin, row.unitWeightG));
}

// 金额是 0 大概率是这个货号在产品管理里还没设工厂价，账单上这一行等于白算了，得提醒去补上
function isZeroAmount(row: BillingDetailRow) {
  return row.amount === 0;
}

// 同一天、同货号、同数量——极可能是同一批货被重复录入到账单里了（比如入库那边强行
// 跳过了重复提醒）。这里拿全部明细（不受 tab 筛选影响）找一遍，出现次数 >1 的都标出来
const duplicateRowCounts = computed(() => {
  if (!summary.value) return new Map<string, number>();
  const counts = new Map<string, number>();
  for (const d of summary.value.details) {
    const key = `${d.date}|${d.sku}|${d.qty}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
});

function isDuplicateRow(row: BillingDetailRow) {
  return (duplicateRowCounts.value.get(`${row.date}|${row.sku}|${row.qty}`) ?? 0) > 1;
}

// 小图标不够显眼，有问题的这一整行都高亮，一眼就能扫到；具体是哪种问题看各自列上的小图标提示
function rowClassName({ row }: { row: BillingDetailRow }) {
  return isBigQtyDiff(row) || isZeroAmount(row) || isDuplicateRow(row) ? "qty-diff-row" : "";
}

async function handleQuery() {
  if (!factoryId.value || !yearMonth.value) {
    ElMessage.warning("请选择玩具厂和时间范围");
    return;
  }
  loading.value = true;
  skuFilter.value = "";
  try {
    summary.value = await getBillingSummary(factoryId.value, yearMonth.value);
  } finally {
    loading.value = false;
  }
}

async function togglePaymentStatus() {
  if (!summary.value) return;
  const nextStatus =
    summary.value.status === BillPaymentStatus.Unpaid
      ? BillPaymentStatus.Paid
      : BillPaymentStatus.Unpaid;
  await ElMessageBox.confirm(
    `确定将「${summary.value.factoryName} ${summary.value.yearMonth}」标记为${
      nextStatus === BillPaymentStatus.Paid ? "已收款" : "未收款"
    }吗？`,
    "确认",
  );
  await updatePaymentStatus({ factoryId: factoryId.value, yearMonth: yearMonth.value, status: nextStatus });
  ElMessage.success("已更新");
  handleQuery();
}

onMounted(async () => {
  await loadFactories();
  if (factoryId.value) handleQuery();
});
</script>

<template>
  <div class="billing-page">
    <!-- 玩具厂/账期的筛选查询直接放进对账单卡片里，不用再拆一张单独的卡片；
         这块不依赖 summary，选完就能点查询，不会因为还没查出结果就先被隐藏掉 -->
    <el-card class="statement-card">
      <div class="statement-title">
        <h2>应收对账单</h2>
        <div v-if="summary" class="statement-actions">
          <!-- 未收款还是用普通标签，一眼看出"还没处理"；已收款要的是那种正式单据盖了
               红章的感觉，一眼就笃定"这笔完事了"，所以单独做成印章样式，不再用小标签 -->
          <el-tag v-if="summary.status !== 'paid'" type="warning" size="large">未收款</el-tag>
          <el-button link type="primary" @click="togglePaymentStatus">
            标记为{{ summary.status === "paid" ? "未收款" : "已收款" }}
          </el-button>
        </div>
      </div>

      <div class="statement-meta">
        <el-form inline class="meta-form">
          <el-form-item label="玩具厂">
            <el-select v-model="factoryId" style="width: 200px" @change="handleQuery">
              <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="账期">
            <el-select v-model="yearMonth" style="width: 160px" @change="handleQuery">
              <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
            </el-select>
          </el-form-item>
        </el-form>
      </div>

      <template v-if="summary">
        <template v-if="summary.bySku.length">
          <!-- 应收汇总在左，明细流水在右，横向并排；应收汇总永远是这个玩具厂这个月的全部应收，
               不随右边的 tab 切换变化——不管在看哪个货号的流水，应收合计都是同一个数 -->
          <div class="statement-row">
            <div class="statement-summary">
              <!-- 已收款：盖一个绿色印章上去，就压在"应收合计"这张单据卡片的右上角，
                   跟真实单据盖章在纸面上的感觉一样——之前放在页面标题区，旁边一大片
                   空白，看着像个孤立的装饰，不像盖在账单上 -->
              <div v-if="summary && summary.status === 'paid'" class="paid-stamp">
                <span class="paid-stamp-text">已收款</span>
              </div>
              <table class="summary-table">
                <thead>
                  <tr>
                    <th>货号</th>
                    <th>名称</th>
                    <th class="num">出货数量</th>
                    <th class="num">金额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in summary.bySku" :key="s.sku">
                    <td>{{ s.sku }}</td>
                    <td>{{ s.name }}</td>
                    <td class="num">{{ s.qty.toLocaleString() }}</td>
                    <td class="num">¥{{ s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr class="grand-total">
                    <td colspan="2">应收合计</td>
                    <td class="num">{{ summary.totalQty.toLocaleString() }}</td>
                    <td class="num">¥{{ summary.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div class="statement-detail-wrap">
              <!-- 按货号切换的 tab，点哪个货号下面明细表就只显示那一行的流水；"全部"tab 显示完整月度流水 -->
              <el-tabs v-model="skuFilter" class="sku-tabs">
                <el-tab-pane label="全部" name="" />
                <el-tab-pane v-for="s in summary.bySku" :key="s.sku" :label="`${s.sku} · ${s.name}`" :name="s.sku" />
              </el-tabs>

              <div class="statement-detail">
                <el-table :data="filteredDetails" border size="small" height="100%" :row-class-name="rowClassName">
                  <el-table-column prop="date" label="日期" width="110" />
                  <el-table-column label="货号" width="90">
                    <template #default="{ row }">
                      {{ row.sku }}
                      <el-tooltip v-if="isDuplicateRow(row)" content="同一天、同货号、同数量的记录不止一条，疑似重复录入，请核对">
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <!-- 名称固定宽度，太长就省略号+悬浮提示，不然名字一长整列被撑得很宽 -->
                  <el-table-column prop="name" label="名称" width="140" show-overflow-tooltip />
                  <el-table-column label="重量(斤)" width="90" align="right">
                    <template #default="{ row }">{{ row.weightJin }}</template>
                  </el-table-column>
                  <el-table-column label="单个克重(g)" width="110" align="right">
                    <template #default="{ row }">{{ row.unitWeightG }}</template>
                  </el-table-column>
                  <el-table-column label="出货数量" width="130" align="right">
                    <template #default="{ row }">
                      {{ row.qty.toLocaleString() }}
                      <el-tooltip
                        v-if="isBigQtyDiff(row)"
                        content="跟按重量算出来的数量相差超过 5 个，很可能录错了，建议核对"
                      >
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="工厂价" width="90" align="right">
                    <template #default="{ row }">{{ row.factoryPrice.toFixed(4) }}</template>
                  </el-table-column>
                  <el-table-column label="金额" width="120" align="right">
                    <template #default="{ row }">
                      ¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}
                      <el-tooltip v-if="isZeroAmount(row)" content="金额是 0，很可能是这个货号在产品管理里还没设工厂价，去补一下">
                        <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-table-column>
                  <el-table-column label="附件" width="70" align="center">
                    <template #default="{ row }">
                      <el-image
                        :src="row.imageUrl"
                        :preview-src-list="[row.imageUrl]"
                        preview-teleported
                        fit="cover"
                        class="detail-thumb"
                        :style="{ transform: `rotate(${row.rotation}deg)` }"
                      />
                    </template>
                  </el-table-column>
                </el-table>
                <el-empty v-if="!filteredDetails.length" description="暂无流水" />
              </div>
            </div>
          </div>
        </template>
        <el-empty v-else description="该月暂无入库记录" />
      </template>
    </el-card>
  </div>
</template>

<style scoped>
/* 让卡片一路撑到浏览器可视区域底部，而不是内容多高页面就多高、下面剩一大截空白。
   .main（BasicLayout 里滚动的那个容器）本身已经是撑满视口剩余高度的，这里只要
   让这个页面的根节点和卡片跟着一路 height:100% / flex:1 传下去就行 */
.billing-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.statement-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 绿色印章：双层圆圈 + 旋转 + 半透明，模拟盖在纸质单据上的实体章。挂在"应收合计"
   这张单据卡片的右上角、往外探出去一点，是真的"盖在单子上"，不是摆在页面标题区
   旁边一片空白里当装饰 */
.paid-stamp {
  position: absolute;
  top: -16px;
  right: -16px;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  border: 2.5px solid #2e7d32;
  box-shadow: 0 0 0 2px #2e7d32 inset, 0 0 0 4.5px rgba(46, 125, 50, 0.35) inset;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: rotate(-16deg);
  opacity: 0.82;
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 5;
  animation: stamp-in 0.25s ease-out;
}

.paid-stamp-text {
  color: #2e7d32;
  font-size: 16px;
  font-weight: 900;
  letter-spacing: 2px;
  writing-mode: horizontal-tb;
  text-align: center;
  line-height: 1.3;
}

@keyframes stamp-in {
  from {
    opacity: 0;
    transform: rotate(-16deg) scale(1.6);
  }
  to {
    opacity: 0.82;
    transform: rotate(-16deg) scale(1);
  }
}

.statement-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 汇总信息、明细表、合计放进同一张卡片里，看着就是一张完整的对账单，
   不是拆成好几块互不相干的卡片 */
.statement-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  margin-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.statement-title h2 {
  margin: 0;
  font-size: 20px;
}

.statement-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.statement-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 32px;
  margin-bottom: 20px;
  font-size: 15px;
}

.meta-label {
  color: #909399;
  font-size: 13px;
  margin-right: 6px;
}

.meta-highlight {
  font-weight: 600;
  color: #e6a23c;
}

/* 应收合计在左，明细流水在右，横向并排；应收合计这块宽度只随内容走，不随明细表被拉宽，
   但高度要跟右边一样高（align-items: stretch），不能矮一截 */
.statement-row {
  display: flex;
  align-items: stretch;
  gap: 24px;
  margin-top: 16px;
  flex: 1;
  min-height: 0;
}

/* 应收合计只随内容撑高度就行，不跟着右边明细表一起被拉满——align-self: flex-start
   跳出 .statement-row 的 stretch，自己顶部对齐、多高算多高 */
.statement-summary {
  flex: 0 0 auto;
  align-self: flex-start;
  width: fit-content;
  background: #fff;
  padding: 4px 8px;
  border-radius: 6px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  box-sizing: border-box;
  /* 印章绝对定位盖在这张"应收合计"单据卡片上，要靠这个立定位上下文 */
  position: relative;
}

/* 明细这一侧（tab + 表格）占满剩下的宽度，同时纵向也是 tab 固定、表格吃掉剩下的高度 */
.statement-detail-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sku-tabs {
  margin-top: 0;
  flex: 0 0 auto;
}

/* el-table 绑了 height="100%"，靠这个容器有确定高度撑满剩余空间，多出来的行自己滚动 */
.statement-detail {
  margin-top: 16px;
  flex: 1;
  min-height: 0;
}

/* 按货号分开的汇总小表，做成正式单据常见的那种简洁线条风格（不是 el-table 那套），
   跟上面的明细表拉开层次，一眼看出这是"总结"不是"流水"；右对齐、不铺满整行 */
.summary-table {
  width: 100%;
  max-width: 560px;
  border-collapse: collapse;
  font-size: 14px;
}

.summary-table th,
.summary-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #ebeef5;
}

.summary-table th {
  color: #909399;
  font-weight: 500;
  font-size: 13px;
}

.summary-table td.num,
.summary-table th.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.summary-table tfoot .grand-total td {
  border-bottom: none;
  border-top: 2px solid #303133;
  font-weight: 700;
  font-size: 16px;
  color: #e6a23c;
}

.detail-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  cursor: zoom-in;
  vertical-align: middle;
}

.qty-diff-icon {
  color: #f56c6c;
  margin-left: 2px;
  vertical-align: middle;
  cursor: help;
}

/* row-class-name 加到的是 el-table 内部真实的 <tr>，scoped 样式要用 :deep() 穿透进去 */
:deep(.qty-diff-row td) {
  background-color: #fef0f0;
}

/* 手机上应收合计和明细表并排会太挤，改成上下堆叠；应收合计这块也不用再 fit-content
   缩到很窄，直接占满宽度好读一些 */
@media (max-width: 768px) {
  .statement-row {
    flex-direction: column;
  }

  .statement-summary {
    width: 100%;
  }

  .summary-table {
    max-width: none;
  }
}
</style>
