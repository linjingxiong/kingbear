<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ProductRangeGroupStat } from "@kingbear/shared";
import { getProductRangeSummary } from "../../api/dashboard";

// 不选日期就是"所有时间"——默认状态，跟入库/账单那些默认当月不一样，这里是刻意的
const dateRange = ref<[string, string] | null>(null);
const groups = ref<ProductRangeGroupStat[]>([]);
const loading = ref(false);

type RangeNode = {
  rowKey: string;
  isGroup: boolean;
  label: string;
  sub: string;
  qty: number;
  amount: number;
  children?: RangeNode[];
};

// 树形：产品是父行，展开是它下面各道工序自己的数字；"未归集"的工序按玩具厂分开放，
// 不同厂的未归集工序不混在一起（跟后端算法保持一致）
const treeData = computed<RangeNode[]>(() =>
  groups.value.map((g, gi) => ({
    rowKey: `g_${gi}`,
    isGroup: true,
    label: g.productGroupName,
    sub: g.factoryName,
    qty: g.qty,
    amount: g.amount,
    children: g.steps.map((s, si) => ({
      rowKey: `g_${gi}_s_${si}`,
      isGroup: false,
      label: `${s.sku} · ${s.name}`,
      sub: "",
      qty: s.qty,
      amount: s.amount,
    })),
  })),
);

async function load() {
  loading.value = true;
  try {
    const [dateFrom, dateTo] = dateRange.value ?? [undefined, undefined];
    const res = await getProductRangeSummary(dateFrom, dateTo);
    groups.value = res.groups;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <el-card>
    <template #header>
      <div class="panel-header">
        <span>产品加工情况</span>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          clearable
          placeholder="不选就是所有时间"
          size="small"
          style="width: 260px"
          @change="load"
        />
      </div>
    </template>

    <el-table v-loading="loading" :data="treeData" row-key="rowKey" default-expand-all :tree-props="{ children: 'children' }" size="small">
      <el-table-column label="产品 / 工序" min-width="220">
        <template #default="{ row }">
          <template v-if="row.isGroup">
            <strong>{{ row.label }}</strong>
            <span class="sub-text">（{{ row.sub }}）</span>
          </template>
          <template v-else>{{ row.label }}</template>
        </template>
      </el-table-column>
      <el-table-column label="加工数量" width="140" align="right">
        <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="加工金额" width="150" align="right">
        <template #default="{ row }">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !treeData.length" description="所选时间段暂无加工记录" />
  </el-card>
</template>

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.sub-text {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
</style>
