<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { MaterialReconciliationRow } from "@kingbear/shared";
import { getOemReconciliation } from "../../api/oem-reconciliation";

const list = ref<MaterialReconciliationRow[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await getOemReconciliation();
  } finally {
    loading.value = false;
  }
}

// 结余明显是负数——领的料比按配方该用的还少，说明物料去向对不上账，需要人工核查
function isAbnormal(row: MaterialReconciliationRow) {
  return row.balanceQty < 0;
}

function rowClassName({ row }: { row: MaterialReconciliationRow }) {
  return isAbnormal(row) ? "balance-abnormal-row" : "";
}

onMounted(load);
</script>

<template>
  <div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="应耗 = 每条成品回收记录按对应工序的物料配方算出来的物料消耗量之和；结余 = 已发 - 应耗，正常应该 ≥ 0，标红说明物料去向对不上账，需要核查"
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" border :row-class-name="rowClassName">
      <el-table-column prop="oemFactoryName" label="代工厂" width="160" />
      <el-table-column prop="materialName" label="物料" width="160" />
      <el-table-column label="已发放" width="140" align="right">
        <template #default="{ row }">{{ row.issuedQty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="应耗用" width="140" align="right">
        <template #default="{ row }">{{ row.consumedQty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="结余" width="140" align="right">
        <template #default="{ row }">
          {{ row.balanceQty.toLocaleString() }} {{ row.unit }}
          <el-tooltip v-if="isAbnormal(row)" content="结余是负数，领的料比按配方该用的还少，物料去向对不上账，建议核查">
            <el-icon class="abnormal-icon"><WarningFilled /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !list.length" description="暂无发料/回收记录" />
  </div>
</template>

<style scoped>
.abnormal-icon {
  color: #f56c6c;
  margin-left: 2px;
  vertical-align: middle;
  cursor: help;
}

:deep(.balance-abnormal-row td) {
  background-color: #fef0f0;
}
</style>
