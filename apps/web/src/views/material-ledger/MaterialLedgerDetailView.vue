<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs from "dayjs";
import type { FactoryListItem, InboundReturnListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listInboundReturns } from "../../api/inbound-return";

// 物料对账单：按产品分组（折叠，默认收起），每个产品一张表——表头是这个产品用到的各个物料
// 名称，一行是一天，格子里是那天收了多少斤，最后一行"合计"把每个物料的总数加出来。
// 跟纸质出库单本来的样子是一回事（一天一行、好几个物料摊开写），只是换成电子表格好核对。
const route = useRoute();
const router = useRouter();
const factoryId = computed(() => route.params.factoryId as string);

const factories = ref<FactoryListItem[]>([]);
const list = ref<InboundReturnListItem[]>([]);
const loading = ref(false);
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
const yearMonth = ref("");

// 换玩具厂不用退回列表页重新点——直接在这个下拉里切，路由跟着换（链接照样能收藏/分享）
function onFactoryChange(id: string) {
  router.replace(`/material-ledger/${id}`);
}

async function load() {
  loading.value = true;
  try {
    list.value = await listInboundReturns();
  } finally {
    loading.value = false;
  }
}

const factoryRows = computed(() =>
  list.value.filter(
    (r) =>
      r.kind === "issue" &&
      r.factoryId === factoryId.value &&
      (!yearMonth.value || (r.returnDate ?? "").startsWith(yearMonth.value)),
  ),
);

interface PivotRow {
  date: string;
  /** 物料名称 → 那天收的重量(斤) */
  values: Record<string, number>;
  rowTotal: number;
  /** 那天这一批单据的凭证图（同一次提交的几行物料共用同一张图） */
  images: string[];
}
interface ProductPivot {
  productGroupName: string;
  /** 这个产品出现过的物料，按名字排，就是表格的列 */
  materials: string[];
  rows: PivotRow[];
  /** 每个物料的合计（对应"合计"那一行） */
  totals: Record<string, number>;
  grandTotal: number;
}

// 先按产品分组；组内再按日期把当天所有物料摊平成一行（表头=物料名，行=日期），
// 同一天同一个物料出现好几条的话（比如手滑分两次录），重量加在一起
const productPivots = computed<ProductPivot[]>(() => {
  const byProduct = new Map<string, InboundReturnListItem[]>();
  for (const r of factoryRows.value) {
    const key = r.productGroupName || "未指定产品";
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(r);
  }

  const pivots: ProductPivot[] = [];
  for (const [productGroupName, records] of byProduct) {
    const materialsSet = new Set<string>();
    const byDate = new Map<string, { values: Record<string, number>; images: Set<string> }>();
    for (const r of records) {
      const materialName = (r.materialName || r.name || "未知物料").trim();
      materialsSet.add(materialName);
      const date = (r.returnDate ?? "").slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, { values: {}, images: new Set() });
      const d = byDate.get(date)!;
      d.values[materialName] = (d.values[materialName] ?? 0) + r.weightJin;
      for (const url of r.images ?? []) d.images.add(url);
    }
    const materials = [...materialsSet].sort((a, b) => a.localeCompare(b));
    const rows: PivotRow[] = [...byDate.entries()]
      .map(([date, d]) => ({
        date,
        values: d.values,
        rowTotal: Object.values(d.values).reduce((sum, v) => sum + v, 0),
        images: [...d.images],
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const totals: Record<string, number> = {};
    for (const m of materials) totals[m] = rows.reduce((sum, r) => sum + (r.values[m] ?? 0), 0);
    const grandTotal = rows.reduce((sum, r) => sum + r.rowTotal, 0);
    pivots.push({ productGroupName, materials, rows, totals, grandTotal });
  }
  return pivots.sort((a, b) => b.grandTotal - a.grandTotal);
});

const grandTotal = computed(() => productPivots.value.reduce((sum, g) => sum + g.grandTotal, 0));

// 折叠面板默认全收起——数据一多，一进来就展开等于又变回平铺
const activeProducts = ref<string[]>([]);

// el-table 的合计行：第一列写"合计"，物料列按 totals 里对应的数取，小计/凭证列不用数字
function pivotSummary(g: ProductPivot, { columns }: { columns: { label: string }[] }): string[] {
  return columns.map((col, idx) => {
    if (idx === 0) return "合计";
    if (col.label === "小计") return g.grandTotal.toLocaleString();
    if (col.label === "凭证") return "";
    const total = g.totals[col.label];
    return total ? total.toLocaleString() : "-";
  });
}

function fmtDate(iso: string) {
  return iso ? dayjs(iso).format("YYYY-MM-DD") : "-";
}

onMounted(async () => {
  factories.value = await listFactories();
  load();
});
</script>

<template>
  <div v-loading="loading">
    <div class="head-row">
      <el-button link type="primary" @click="router.push('/material-ledger')">← 返回物料台账</el-button>
      <!-- 换玩具厂直接在这个下拉里切，不用退回列表页重新点一遍 -->
      <el-select :model-value="factoryId" filterable style="width: 180px" @change="onFactoryChange">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 160px" class="head-filter">
        <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
      </el-select>
      <span class="filter-summary">累计收到 {{ grandTotal.toLocaleString() }} 斤</span>
    </div>

    <el-collapse v-model="activeProducts">
      <el-collapse-item v-for="g in productPivots" :key="g.productGroupName" :name="g.productGroupName">
        <template #title>
          <span class="product-title">{{ g.productGroupName }}</span>
          <span class="product-sub">合计 {{ g.grandTotal.toLocaleString() }} 斤 · {{ g.rows.length }} 天</span>
        </template>

        <!-- 物料对账单：表头是这个产品各个物料的名字，一行一天，最下面一行是每个物料的合计。
             列一多横向就滚动（日期固定在左、小计/凭证固定在右，中间的物料列滚） -->
        <div class="pivot-wrap">
          <el-table :data="g.rows" size="small" border show-summary :summary-method="(p) => pivotSummary(g, p)">
            <el-table-column label="日期" width="110" fixed="left">
              <template #default="{ row }">{{ fmtDate(row.date) }}</template>
            </el-table-column>
            <el-table-column v-for="m in g.materials" :key="m" :label="m" min-width="90" align="right">
              <template #default="{ row }">{{ row.values[m] ? row.values[m].toLocaleString() : "-" }}</template>
            </el-table-column>
            <el-table-column label="小计" width="100" align="right" fixed="right">
              <template #default="{ row }">{{ row.rowTotal.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="凭证" width="70" align="center" fixed="right">
              <template #default="{ row }">
                <el-image
                  v-if="row.images.length"
                  :src="row.images[0]"
                  :preview-src-list="row.images"
                  hide-on-click-modal
                  preview-teleported
                  fit="cover"
                  class="thumb"
                />
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-collapse-item>
    </el-collapse>
    <el-empty v-if="!loading && !productPivots.length" description="没有符合条件的发料记录" />
  </div>
</template>

<style scoped>
.head-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.head-filter {
  margin-left: auto;
}

.filter-summary {
  color: #909399;
  font-size: 13px;
}

.product-title {
  font-weight: 600;
  margin-right: 12px;
}

.product-sub {
  color: #909399;
  font-size: 13px;
}

.pivot-wrap {
  overflow-x: auto;
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
