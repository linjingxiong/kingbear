<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs from "dayjs";
import type { FactoryListItem, InboundReturnListItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listInboundReturns } from "../../api/inbound-return";

// 这个玩具厂具体收了哪些物料：按"产品"折叠分组，默认都收着，点开哪个产品才看得到它下面
// 的物料，物料这一行再点开才看到每一笔的日期/重量/备注/凭证——三层逐级展开，不会一进来
// 就是一整屏平铺的明细表
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

interface MaterialRow {
  key: string;
  materialName: string;
  totalWeightJin: number;
  recordCount: number;
  firstDate: string;
  lastDate: string;
  records: InboundReturnListItem[];
}
interface ProductGroupRow {
  productGroupName: string;
  totalWeightJin: number;
  recordCount: number;
  materials: MaterialRow[];
}

// 先按产品分组，产品里面再按物料名称分组——两层折叠，跟树目录一个意思
const productGroups = computed<ProductGroupRow[]>(() => {
  const groups = new Map<string, Map<string, MaterialRow>>();
  for (const r of factoryRows.value) {
    const productGroupName = r.productGroupName || "未指定产品";
    const materialName = (r.materialName || r.name || "未知物料").trim();
    const date = (r.returnDate ?? "").slice(0, 10);
    if (!groups.has(productGroupName)) groups.set(productGroupName, new Map());
    const materials = groups.get(productGroupName)!;
    let m = materials.get(materialName);
    if (!m) {
      m = { key: `${productGroupName}|${materialName}`, materialName, totalWeightJin: 0, recordCount: 0, firstDate: date, lastDate: date, records: [] };
      materials.set(materialName, m);
    }
    m.totalWeightJin += r.weightJin;
    m.recordCount += 1;
    if (date && date < m.firstDate) m.firstDate = date;
    if (date && date > m.lastDate) m.lastDate = date;
    m.records.push(r);
  }
  return [...groups.entries()]
    .map(([productGroupName, materials]) => {
      const materialList = [...materials.values()].sort((a, b) => a.materialName.localeCompare(b.materialName));
      return {
        productGroupName,
        totalWeightJin: materialList.reduce((sum, m) => sum + m.totalWeightJin, 0),
        recordCount: materialList.reduce((sum, m) => sum + m.recordCount, 0),
        materials: materialList,
      };
    })
    .sort((a, b) => b.totalWeightJin - a.totalWeightJin);
});

const grandTotal = computed(() => productGroups.value.reduce((sum, g) => sum + g.totalWeightJin, 0));

// 折叠面板默认全收起——数据一多，一进来就展开等于又变回平铺
const activeProducts = ref<string[]>([]);

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
      <el-collapse-item v-for="g in productGroups" :key="g.productGroupName" :name="g.productGroupName">
        <template #title>
          <span class="product-title">{{ g.productGroupName }}</span>
          <span class="product-sub">小计 {{ g.totalWeightJin.toLocaleString() }} 斤 · {{ g.recordCount }} 笔</span>
        </template>

        <el-table :data="g.materials" size="small" row-key="key">
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
      </el-collapse-item>
    </el-collapse>
    <el-empty v-if="!loading && !productGroups.length" description="没有符合条件的发料记录" />
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

.head-title {
  margin: 0;
  font-size: 18px;
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
