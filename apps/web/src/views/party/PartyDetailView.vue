<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import dayjs from "dayjs";
import type { LedgerDirection, PartyBase, PartyLedgerRow, PartyRole } from "@kingbear/shared";
import { getParty, getPartyLedger } from "../../api/party";
import { DIRECTION_LABEL, PARTY_ROLE_LABEL, sourceRoute } from "./party-labels";

// 往来单位详情：同一套页面看任何一个单位（玩具厂/代工厂）。数据是后端把各种单据实时转成的
// 统一流水（见 party.service.ts），方向统一按"这个单位"：入库=货流进这个单位，出库=货从这个单位流出；
// 原来的单据名（入库单/出库单·发料/物料发放/成品回收…）保留在"类型"列里。
// 看"我"（中间环节）时是总账：所有单位的流水合在一起、方向反过来（对象的入库=从我手里出库），并多一列"对方"
const route = useRoute();
const router = useRouter();
const role = computed(() => route.params.role as PartyRole);
const id = computed(() => route.params.id as string);
const isMe = computed(() => role.value === "me");
const roleTagType = computed(() =>
  party.value?.role === "toy_factory" ? "warning" : party.value?.role === "oem_factory" ? "success" : "primary",
);

const party = ref<PartyBase | null>(null);
const rows = ref<PartyLedgerRow[]>([]);
const loading = ref(false);

// 账期：最近 12 个月 + 全部（空字符串）——服务端按月份筛，方向/类型在前端筛
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
const yearMonth = ref("");
const directionFilter = ref<"" | LedgerDirection>("");
const typeFilter = ref("");

async function load() {
  loading.value = true;
  try {
    const [p, ledger] = await Promise.all([
      party.value ? Promise.resolve(party.value) : getParty(role.value, id.value),
      getPartyLedger(role.value, id.value, yearMonth.value || undefined),
    ]);
    party.value = p;
    rows.value = ledger;
  } finally {
    loading.value = false;
  }
}

// 从一个单位的详情直接跳到另一个单位（比如浏览器前进后退）时，重新加载
watch([role, id], () => {
  party.value = null;
  yearMonth.value = "";
  directionFilter.value = "";
  typeFilter.value = "";
  load();
});

const typeOptions = computed(() => [...new Set(rows.value.map((r) => r.typeLabel))]);

const filteredRows = computed(() =>
  rows.value.filter(
    (r) =>
      (!directionFilter.value || r.direction === directionFilter.value) &&
      (!typeFilter.value || r.typeLabel === typeFilter.value),
  ),
);

const inCount = computed(() => filteredRows.value.filter((r) => r.direction === "in").length);
const outCount = computed(() => filteredRows.value.filter((r) => r.direction === "out").length);

/** 按货号/物料汇总：每个货号或物料，入库多少、出库多少（只汇总不做差额——不同单据的计量口径
 * 不一样，"结余"怎么算还没定，先把两边各自的总数摆出来） */
const summaryRows = computed(() => {
  const map = new Map<string, { kind: string; key: string; name: string; inQty: number; outQty: number }>();
  for (const r of filteredRows.value) {
    const k = `${r.itemKind}:${r.itemKey}`;
    let s = map.get(k);
    if (!s) {
      s = { kind: r.itemKind === "product" ? "货号" : "物料", key: r.itemKey, name: r.itemName, inQty: 0, outQty: 0 };
      map.set(k, s);
    }
    if (r.direction === "in") s.inQty += r.qty;
    else s.outQty += r.qty;
  }
  return [...map.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
});

/** 相册：这个单位所有单据的原始照片，同一张图（一张单拆出好几行）只留一份 */
const gallery = computed(() => {
  const seen = new Map<string, PartyLedgerRow>();
  for (const r of filteredRows.value) {
    for (const url of r.images) if (!seen.has(url)) seen.set(url, r);
  }
  return [...seen.entries()].map(([url, r]) => ({ url, date: r.date, typeLabel: r.typeLabel, code: r.code }));
});
const previewList = computed(() => gallery.value.map((g) => g.url));

function fmtDate(iso: string) {
  return dayjs(iso).format("YYYY-MM-DD");
}

function goSource(row: PartyLedgerRow) {
  router.push(sourceRoute(row.source));
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="party-detail">
    <el-card v-if="party" class="head-card">
      <div class="head-row">
        <div>
          <el-button link type="primary" @click="router.push('/party')">← 返回往来单位</el-button>
          <div class="head-title">
            <h2>{{ party.name }}</h2>
            <el-tag :type="roleTagType" effect="plain">
              {{ PARTY_ROLE_LABEL[party.role] }}
            </el-tag>
          </div>
          <div class="head-meta">
            <span v-if="party.contact">联系人：{{ party.contact }}</span>
            <span v-if="party.phone">电话：{{ party.phone }}</span>
            <span v-if="party.address">地址：{{ party.address }}</span>
            <span v-if="party.remark">备注：{{ party.remark }}</span>
          </div>
        </div>
        <div class="head-actions">
          <!-- 玩具厂的应收金额有专门的对账页，这里不重复算一套钱，直接跳过去 -->
          <el-button v-if="party.role === 'toy_factory'" type="primary" plain @click="router.push('/billing')">
            查看应收账单
          </el-button>
        </div>
      </div>
      <div class="stat-row">
        <div class="stat">
          <span class="stat-label">入库（{{ isMe ? "货到了我手里" : "货流进这个单位" }}）</span>
          <strong>{{ inCount }}</strong> 笔
        </div>
        <div class="stat">
          <span class="stat-label">出库（{{ isMe ? "货离开了我手里" : "货从这个单位流出" }}）</span>
          <strong>{{ outCount }}</strong> 笔
        </div>
      </div>
    </el-card>

    <el-card class="body-card">
      <div class="filters">
        <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 150px" @change="load">
          <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
        </el-select>
        <el-radio-group v-model="directionFilter">
          <el-radio-button value="">全部</el-radio-button>
          <el-radio-button value="in">入库</el-radio-button>
          <el-radio-button value="out">出库</el-radio-button>
        </el-radio-group>
        <el-select v-model="typeFilter" placeholder="全部类型" clearable style="width: 160px">
          <el-option v-for="t in typeOptions" :key="t" :label="t" :value="t" />
        </el-select>
      </div>

      <el-tabs>
        <el-tab-pane label="出入库流水">
          <el-table :data="filteredRows" stripe size="small" max-height="560">
            <el-table-column label="日期" width="110">
              <template #default="{ row }">{{ fmtDate(row.date) }}</template>
            </el-table-column>
            <el-table-column label="方向" width="80" align="center">
              <template #default="{ row }">
                <el-tag :type="row.direction === 'in' ? 'success' : 'primary'" size="small" effect="plain">
                  {{ DIRECTION_LABEL[row.direction as LedgerDirection] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column v-if="isMe" label="对方" width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag :type="row.partyRole === 'toy_factory' ? 'warning' : 'success'" effect="plain" size="small">
                  {{ row.partyRole === "toy_factory" ? "玩具厂" : "代工厂" }}
                </el-tag>
                {{ row.partyName }}
              </template>
            </el-table-column>
            <el-table-column label="类型" width="130">
              <template #default="{ row }">
                <span :class="{ 'is-return': row.typeLabel.includes('退货') }">{{ row.typeLabel }}</span>
              </template>
            </el-table-column>
            <el-table-column label="货号 / 物料" min-width="180">
              <template #default="{ row }">
                <span v-if="row.sku" class="sku">{{ row.sku }}</span>
                {{ row.itemName }}
                <span v-if="row.group" class="muted">（{{ row.group }}）</span>
              </template>
            </el-table-column>
            <el-table-column label="重量(斤)" width="90" align="right">
              <template #default="{ row }">{{ row.weightJin || "-" }}</template>
            </el-table-column>
            <el-table-column label="克重(g)" width="90" align="right">
              <template #default="{ row }">{{ row.unitWeightG || "-" }}</template>
            </el-table-column>
            <el-table-column label="数量" width="100" align="right">
              <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="原因 / 备注" min-width="140" show-overflow-tooltip>
              <template #default="{ row }">{{ [row.reason, row.remark].filter(Boolean).join(" · ") || "-" }}</template>
            </el-table-column>
            <el-table-column label="单据" width="70" align="center">
              <template #default="{ row }">
                <el-image
                  v-if="row.images.length"
                  :src="row.images[0]"
                  :preview-src-list="row.images"
                  preview-teleported
                  fit="cover"
                  class="thumb"
                />
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="goSource(row)">去处理</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && !filteredRows.length" description="没有符合条件的流水" />
        </el-tab-pane>

        <el-tab-pane label="按货号 / 物料汇总">
          <el-table :data="summaryRows" stripe size="small">
            <el-table-column prop="kind" label="类别" width="90" />
            <el-table-column prop="key" label="货号 / 物料" width="180" />
            <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
            <el-table-column label="入库数量" width="130" align="right">
              <template #default="{ row }">{{ row.inQty ? row.inQty.toLocaleString() : "-" }}</template>
            </el-table-column>
            <el-table-column label="出库数量" width="130" align="right">
              <template #default="{ row }">{{ row.outQty ? row.outQty.toLocaleString() : "-" }}</template>
            </el-table-column>
          </el-table>
          <div class="tip">
            入库、出库各自的总数，不做相减——不同单据的计量口径不一样，结余怎么算还没定。
          </div>
          <el-empty v-if="!loading && !summaryRows.length" description="没有符合条件的流水" />
        </el-tab-pane>

        <el-tab-pane label="单据相册">
          <div class="gallery-grid">
            <div v-for="(g, idx) in gallery" :key="g.url" class="gallery-card">
              <el-image
                :src="g.url"
                :preview-src-list="previewList"
                :initial-index="idx"
                preview-teleported
                fit="cover"
                class="gallery-thumb"
                lazy
              />
              <div class="gallery-caption">{{ g.typeLabel }}</div>
              <div class="gallery-caption muted">{{ fmtDate(g.date) }}{{ g.code ? ` · ${g.code}` : "" }}</div>
            </div>
          </div>
          <el-empty v-if="!loading && !gallery.length" description="没有单据照片" />
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.party-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.head-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.head-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.head-title h2 {
  margin: 0;
  font-size: 20px;
}

.head-meta {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-top: 8px;
  color: #606266;
  font-size: 13px;
}

.stat-row {
  display: flex;
  gap: 32px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #f2f3f5;
  flex-wrap: wrap;
}

.stat {
  color: #606266;
}

.stat-label {
  display: block;
  color: #909399;
  font-size: 12px;
  margin-bottom: 2px;
}

.stat strong {
  font-size: 22px;
  color: #303133;
}

.filters {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.sku {
  font-weight: 600;
  margin-right: 6px;
}

.is-return {
  color: #f56c6c;
}

.muted {
  color: #c0c4cc;
}

.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}

.tip {
  margin-top: 10px;
  color: #909399;
  font-size: 12px;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.gallery-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.gallery-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  cursor: zoom-in;
  background: #f5f7fa;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.gallery-caption {
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
