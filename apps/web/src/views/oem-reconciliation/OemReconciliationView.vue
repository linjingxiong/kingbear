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

// 结余是负数——产品物料是"领的比该用的还少"，通用物料是"发出去的比收回来的还多但记录对不上"，
// 都说明物料/框去向对不上账，需要人工核查
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
      style="margin-bottom: 12px"
      title="产品物料：结余 = 已发 - 应耗（应耗按成品回收 × 工序配方算）。通用物料（框等）：结余 = 已发 - 已回收，不算消耗。结余为负标红，需核查。"
    />
    <el-table v-loading="loading" :data="list" border :row-class-name="rowClassName">
      <el-table-column prop="oemFactoryName" label="代工厂" width="130" />
      <el-table-column prop="productGroupName" label="产品 / 类型" width="130" />
      <el-table-column prop="materialName" label="物料" width="130" />
      <el-table-column label="已发放" width="120" align="right">
        <template #default="{ row }">{{ row.issuedQty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="应耗用" width="120" align="right">
        <template #default="{ row }">
          <span v-if="row.kind === 'product'">{{ row.consumedQty.toLocaleString() }} {{ row.unit }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="已回收" width="120" align="right">
        <template #default="{ row }">
          <span v-if="row.kind === 'common'">{{ row.returnedQty.toLocaleString() }} {{ row.unit }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="结余" width="130" align="right">
        <template #default="{ row }">
          {{ row.balanceQty.toLocaleString() }} {{ row.unit }}
          <el-tooltip v-if="isAbnormal(row)" content="结余是负数，物料/框去向对不上账，建议核查">
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

.muted {
  color: #c0c4cc;
}

:deep(.balance-abnormal-row td) {
  background-color: #fef0f0;
}
</style>
