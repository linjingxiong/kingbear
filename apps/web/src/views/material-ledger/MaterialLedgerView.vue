<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import dayjs from "dayjs";
import type { FactoryListItem, InboundReturnListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listInboundReturns } from "../../api/inbound-return";

// 物料台账：先只管"玩具厂发给我多少物料"这一段（出库单·发料）。选玩具厂、选月份，
// 直接在这一页看对账表——不用先看一个厂列表、点进去才看明细，一步到位。
// 数据直接复用出库单列表接口，前端自己汇总，没有新接口。
const factories = ref<FactoryListItem[]>([]);
const factoryId = ref("");
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
// 默认当月，不用每次自己选
const yearMonth = ref(dayjs().format("YYYY-MM"));

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

// 产品用 tab 横向切换，不用一个个往下展开；默认停在收得最多的那个产品
// （productPivots 本来就是按合计从大到小排的），换厂/换月之后原来选的产品可能已经不在了，
// 自动跳回收得最多的那个，不会停在一个空 tab 上
const activeProduct = ref("");
watch(
  productPivots,
  (groups) => {
    if (!groups.some((g) => g.productGroupName === activeProduct.value)) {
      activeProduct.value = groups[0]?.productGroupName ?? "";
    }
  },
  { immediate: true },
);

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
  // 默认优先选"美奇"，列表里没有的话（比如换了环境）就不选，不会白屏选不出来
  const preferred = factories.value.find((f) => f.name === "美奇");
  if (preferred) factoryId.value = preferred.id;
  load();
});
</script>

<template>
  <div v-loading="loading">
    <el-alert type="info" :closable="false" show-icon class="scope-hint">
      <template #title>
        这里先只算"玩具厂发料给我"收到的物料（出库单·发料）。发给代工厂的那部分（物料流转-物料对账）
        还没接进来算结余，先看清楚收了多少
      </template>
    </el-alert>

    <div class="head-row">
      <el-select v-model="factoryId" placeholder="选择玩具厂" filterable style="width: 180px">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 160px">
        <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
      </el-select>
      <span class="filter-summary">累计收到 {{ grandTotal.toLocaleString() }} 斤</span>
    </div>

    <!-- 产品用 tab 横向切换，不用像折叠面板那样一个个往下展开——点哪个产品就看哪个产品的表 -->
    <el-tabs v-model="activeProduct">
      <el-tab-pane v-for="g in productPivots" :key="g.productGroupName" :name="g.productGroupName" lazy>
        <template #label>
          <span>{{ g.productGroupName }}</span>
          <span class="product-sub">（{{ g.grandTotal.toLocaleString() }} 斤）</span>
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
      </el-tab-pane>
    </el-tabs>
    <el-empty v-if="!loading && !productPivots.length" description="没有符合条件的发料记录" />
  </div>
</template>

<style scoped>
.scope-hint {
  margin-bottom: 12px;
}

.head-row {
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
