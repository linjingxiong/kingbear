<script setup lang="ts">
import { onMounted, ref } from "vue";
import dayjs from "dayjs";
import { ElMessage, ElMessageBox } from "element-plus";
import { BillPaymentStatus, type BillingSummary, type FactoryListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { getBillingSummary, updatePaymentStatus } from "../../api/billing";

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref<string>("");
const yearMonth = ref<string>(dayjs().format("YYYY-MM"));
const summary = ref<BillingSummary | null>(null);
const loading = ref(false);

async function loadFactories() {
  factories.value = await listFactories();
  if (!factoryId.value && factories.value.length) factoryId.value = factories.value[0].id;
}

async function handleQuery() {
  if (!factoryId.value || !yearMonth.value) {
    ElMessage.warning("请选择玩具厂和时间范围");
    return;
  }
  loading.value = true;
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
  <div>
    <el-card class="query-card">
      <el-form inline>
        <el-form-item label="玩具厂">
          <el-select v-model="factoryId" style="width: 200px">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="月份">
          <el-date-picker v-model="yearMonth" type="month" value-format="YYYY-MM" style="width: 160px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="handleQuery">查询</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <template v-if="summary">
      <el-card class="summary-card">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="玩具厂">{{ summary.factoryName }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ summary.yearMonth }}</el-descriptions-item>
          <el-descriptions-item label="入库次数">{{ summary.inboundCount }}</el-descriptions-item>
          <el-descriptions-item label="加工数量">{{ summary.totalQty }}</el-descriptions-item>
          <el-descriptions-item label="加工金额">¥{{ summary.totalAmount.toFixed(2) }}</el-descriptions-item>
          <el-descriptions-item label="状态" :span="2">
            <el-tag :type="summary.status === 'paid' ? 'success' : 'warning'">
              {{ summary.status === "paid" ? "已收款" : "未收款" }}
            </el-tag>
            <el-button link type="primary" style="margin-left: 12px" @click="togglePaymentStatus">
              标记为{{ summary.status === "paid" ? "未收款" : "已收款" }}
            </el-button>
          </el-descriptions-item>
        </el-descriptions>
      </el-card>

      <el-card>
        <template #header>明细</template>
        <el-table :data="summary.details" border size="small">
          <el-table-column prop="date" label="日期" width="120" />
          <el-table-column prop="sku" label="货号" width="140" />
          <el-table-column prop="name" label="名称" />
          <el-table-column prop="qty" label="数量" width="100" align="right" />
          <el-table-column label="工厂价" width="100" align="right">
            <template #default="{ row }">{{ row.factoryPrice.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="金额" width="110" align="right">
            <template #default="{ row }">¥{{ row.amount.toFixed(2) }}</template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!summary.details.length" description="该月暂无入库记录" />
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.query-card,
.summary-card {
  margin-bottom: 16px;
}
</style>
