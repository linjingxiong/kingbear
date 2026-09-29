<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import type { FactoryListItem, InboundReturnListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listInboundReturns } from "../../api/inbound-return";

// 物料台账：先只管"玩具厂发给我多少物料"这一段（出库单·发料），按物料名称/产品/玩具厂
// 汇总一下收了多少斤、哪几笔。跟代工厂那边的物料对账（物料流转-物料对账）是分开的两件事，
// 以后要把"我发给代工厂多少"也接进来、算出结余，再在这个基础上加，现在先把收到的这一段立起来。
// 数据直接复用出库单列表接口（本来就带了物料名/产品名/玩具厂名），前端自己汇总，没有新接口。
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

// 只看发料（玩具厂给我的原材料），退货是另一回事（退货是货，不是料）；再按玩具厂/月份筛一遍
const issueRows = computed(() =>
  list.value.filter((r) => {
    if (r.kind !== "issue") return false;
    if (factoryId.value && r.factoryId !== factoryId.value) return false;
    if (yearMonth.value && !(r.returnDate ?? "").startsWith(yearMonth.value)) return false;
    return true;
  }),
);

interface LedgerRow {
  key: string;
  factoryName: string;
  productGroupName: string;
  materialName: string;
  totalWeightJin: number;
  recordCount: number;
  firstDate: string;
  lastDate: string;
  records: InboundReturnListItem[];
}

// 按"玩具厂 + 产品 + 物料名称"分组汇总——同一个物料换个玩具厂供、或者没绑产品，都分开算，
// 不糊在一起看不清是哪来的
const ledgerRows = computed<LedgerRow[]>(() => {
  const groups = new Map<string, LedgerRow>();
  for (const r of issueRows.value) {
    const materialName = (r.materialName || r.name || "未知物料").trim();
    const productGroupName = r.productGroupName || "未指定产品";
    const key = `${r.factoryId}|${productGroupName}|${materialName}`;
    const date = (r.returnDate ?? "").slice(0, 10);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        factoryName: r.factoryName,
        productGroupName,
        materialName,
        totalWeightJin: 0,
        recordCount: 0,
        firstDate: date,
        lastDate: date,
        records: [],
      };
      groups.set(key, g);
    }
    g.totalWeightJin += r.weightJin;
    g.recordCount += 1;
    if (date && date < g.firstDate) g.firstDate = date;
    if (date && date > g.lastDate) g.lastDate = date;
    g.records.push(r);
  }
  return [...groups.values()].sort(
    (a, b) => a.factoryName.localeCompare(b.factoryName) || a.materialName.localeCompare(b.materialName),
  );
});

const totalWeight = computed(() => ledgerRows.value.reduce((sum, r) => sum + r.totalWeightJin, 0));

function fmtDate(iso: string) {
  return iso ? dayjs(iso).format("YYYY-MM-DD") : "-";
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
        还没接进来算结余，先看清楚收了多少
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
        共 {{ ledgerRows.length }} 组，累计收到 {{ totalWeight.toLocaleString() }} 斤
      </span>
    </div>

    <el-table v-loading="loading" :data="ledgerRows" stripe size="small" row-key="key">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.records" size="small" class="detail-table">
            <el-table-column label="日期" width="110">
              <template #default="{ row: d }">{{ fmtDate(d.returnDate) }}</template>
            </el-table-column>
            <el-table-column label="重量(斤)" width="100" align="right">
              <template #default="{ row: d }">{{ d.weightJin }}</template>
            </el-table-column>
            <el-table-column prop="remark" label="备注" show-overflow-tooltip />
            <el-table-column label="凭证" width="70" align="center">
              <template #default="{ row: d }">
                <el-image
                  v-if="d.images.length"
                  :src="d.images[0]"
                  :preview-src-list="d.images"
                  hide-on-click-modal
                  preview-teleported
                  fit="cover"
                  class="thumb"
                />
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-table-column>
      <el-table-column prop="factoryName" label="玩具厂" width="140" />
      <el-table-column prop="productGroupName" label="产品" width="150" show-overflow-tooltip />
      <el-table-column prop="materialName" label="物料名称" min-width="160" show-overflow-tooltip />
      <el-table-column label="收到重量(斤)" width="130" align="right">
        <template #default="{ row }">{{ row.totalWeightJin.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="笔数" width="80" align="right">
        <template #default="{ row }">{{ row.recordCount }}</template>
      </el-table-column>
      <el-table-column label="最早 · 最近" width="200">
        <template #default="{ row }">{{ fmtDate(row.firstDate) }} · {{ fmtDate(row.lastDate) }}</template>
      </el-table-column>
    </el-table>
    <el-empty v-if="!loading && !ledgerRows.length" description="没有符合条件的发料记录" />
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

.detail-table {
  margin: 4px 24px;
  width: calc(100% - 48px);
}

.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}

.muted {
  color: #c0c4cc;
}
</style>
