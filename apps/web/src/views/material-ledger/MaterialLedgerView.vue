<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import type { FactoryListItem, InboundReturnListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listInboundReturns } from "../../api/inbound-return";

// 物料台账：先只管"玩具厂发给我多少物料"这一段（出库单·发料）。这一页是入口，按玩具厂
// 分组只看一个总数，不把每个物料每一笔都摊在一张大表里——想看某个厂具体收了什么，点进去看。
// 数据直接复用出库单列表接口，前端自己按玩具厂汇总，没有新接口。
const router = useRouter();
const factories = ref<FactoryListItem[]>([]);
const factoryId = ref("");
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
const yearMonth = ref("");

const list = ref<InboundReturnListItem[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await listInboundReturns();
  } finally {
    loading.value = false;
  }
}

const issueRows = computed(() =>
  list.value.filter(
    (r) =>
      r.kind === "issue" &&
      (!factoryId.value || r.factoryId === factoryId.value) &&
      (!yearMonth.value || (r.returnDate ?? "").startsWith(yearMonth.value)),
  ),
);

interface FactorySummary {
  factoryId: string;
  factoryName: string;
  materialCount: number;
  totalWeightJin: number;
  recordCount: number;
  lastDate: string;
}

const factorySummaries = computed<FactorySummary[]>(() => {
  const groups = new Map<string, FactorySummary & { materials: Set<string> }>();
  for (const r of issueRows.value) {
    let g = groups.get(r.factoryId);
    if (!g) {
      g = {
        factoryId: r.factoryId,
        factoryName: r.factoryName,
        materialCount: 0,
        totalWeightJin: 0,
        recordCount: 0,
        lastDate: "",
        materials: new Set(),
      };
      groups.set(r.factoryId, g);
    }
    g.materials.add((r.materialName || r.name || "").trim());
    g.totalWeightJin += r.weightJin;
    g.recordCount += 1;
    const date = (r.returnDate ?? "").slice(0, 10);
    if (date > g.lastDate) g.lastDate = date;
  }
  return [...groups.values()]
    .map((g) => ({ ...g, materialCount: g.materials.size }))
    .sort((a, b) => b.totalWeightJin - a.totalWeightJin);
});

const grandTotal = computed(() => factorySummaries.value.reduce((sum, f) => sum + f.totalWeightJin, 0));

function fmtDate(iso: string) {
  return iso ? dayjs(iso).format("YYYY-MM-DD") : "-";
}

function openDetail(row: FactorySummary) {
  router.push(`/material-ledger/${row.factoryId}`);
}

onMounted(async () => {
  factories.value = await listFactories();
  load();
});
</script>

<template>
  <div>
    <el-alert type="info" :closable="false" show-icon class="scope-hint">
      <template #title>
        这里先只算"玩具厂发料给我"收到的物料（出库单·发料）。发给代工厂的那部分（物料流转-物料对账）
        还没接进来算结余，先看清楚每个厂收了多少
      </template>
    </el-alert>

    <div class="filter-bar">
      <el-select v-model="factoryId" placeholder="全部玩具厂" clearable filterable style="width: 200px">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 160px">
        <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
      </el-select>
      <span class="filter-summary" v-if="!loading">
        {{ factorySummaries.length }} 个玩具厂，累计收到 {{ grandTotal.toLocaleString() }} 斤
      </span>
    </div>

    <!-- 只到"玩具厂"这一层汇总，不把物料/明细摊开——点一行进去再看这个厂具体收了什么 -->
    <el-table v-loading="loading" :data="factorySummaries" stripe @row-click="openDetail" class="factory-table">
      <el-table-column prop="factoryName" label="玩具厂" min-width="160">
        <template #default="{ row }">
          <strong>{{ row.factoryName }}</strong>
        </template>
      </el-table-column>
      <el-table-column label="物料种类" width="110" align="right">
        <template #default="{ row }">{{ row.materialCount }} 种</template>
      </el-table-column>
      <el-table-column label="累计收到" width="140" align="right">
        <template #default="{ row }">{{ row.totalWeightJin.toLocaleString() }} 斤</template>
      </el-table-column>
      <el-table-column label="笔数" width="90" align="right">
        <template #default="{ row }">{{ row.recordCount }} 笔</template>
      </el-table-column>
      <el-table-column label="最近一次" width="130">
        <template #default="{ row }">{{ fmtDate(row.lastDate) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="openDetail(row)">查看明细</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !factorySummaries.length" description="没有符合条件的发料记录" />
  </div>
</template>

<style scoped>
.scope-hint {
  margin-bottom: 12px;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.filter-summary {
  color: #909399;
  font-size: 13px;
}

.factory-table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
