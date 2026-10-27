<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import dayjs from "dayjs";
import type { FactoryListItem, GalleryKind, InboundGalleryItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { getInboundGallery } from "../../api/inbound";
import GalleryThumbGrid from "./GalleryThumbGrid.vue";

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref<string>("");

// 平铺视图：按条件筛，结果铺成一个网格；文件夹视图：按月份分文件夹，点进某个月
// 再看这个月的入库/出库照片——两种看法互不影响，筛选条件（玩具厂）两边共用
const viewMode = ref<"flat" | "folder">("folder");

// 账期下拉：最近12个月 + "全部"，"全部"就是空字符串不传 yearMonth，跟应收账单那个选择器同一个思路
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
const yearMonth = ref<string>("");
// 单据种类：空字符串 = 入库单、出库单都看
const kind = ref<"" | GalleryKind>("");

const list = ref<InboundGalleryItem[]>([]);
const loading = ref(false);
const flatLoaded = ref(false);

async function loadFlat() {
  loading.value = true;
  try {
    list.value = await getInboundGallery({
      factoryId: factoryId.value || undefined,
      yearMonth: yearMonth.value || undefined,
      kind: kind.value || undefined,
    });
    flatLoaded.value = true;
  } finally {
    loading.value = false;
  }
}

// 文件夹视图要按月份分组，所以拉的是这个玩具厂下"全部月份、全部种类"的照片，
// 分组、按入库/出库拆开都在前端做，不用再求后端加一个"按月分组"的接口
const folderAll = ref<InboundGalleryItem[]>([]);
const folderLoading = ref(false);
const folderLoaded = ref(false);
const openedMonth = ref("");

async function loadFolderAll() {
  folderLoading.value = true;
  try {
    folderAll.value = await getInboundGallery({ factoryId: factoryId.value || undefined });
    folderLoaded.value = true;
  } finally {
    folderLoading.value = false;
  }
}

type MonthFolder = { month: string; inboundCount: number; outboundCount: number; total: number };

const folders = computed<MonthFolder[]>(() => {
  const map = new Map<string, { inbound: number; outbound: number }>();
  for (const item of folderAll.value) {
    const m = dayjs(item.inboundDate).format("YYYY-MM");
    const entry = map.get(m) ?? { inbound: 0, outbound: 0 };
    if (item.kind === "inbound") entry.inbound++;
    else entry.outbound++;
    map.set(m, entry);
  }
  return Array.from(map.entries())
    .map(([month, c]) => ({ month, inboundCount: c.inbound, outboundCount: c.outbound, total: c.inbound + c.outbound }))
    .sort((a, b) => (a.month < b.month ? 1 : -1));
});

const openedMonthInbound = computed(() =>
  folderAll.value.filter((i) => i.kind === "inbound" && dayjs(i.inboundDate).format("YYYY-MM") === openedMonth.value),
);
const openedMonthOutbound = computed(() =>
  folderAll.value.filter((i) => i.kind === "outbound" && dayjs(i.inboundDate).format("YYYY-MM") === openedMonth.value),
);

function openFolder(month: string) {
  openedMonth.value = month;
}
function backToFolders() {
  openedMonth.value = "";
}

function onFactoryChange() {
  openedMonth.value = "";
  // 换了玩具厂，两边缓存的数据都跟新选的厂对不上了，标记成"没加载过"，
  // 当前这个视图立刻重新拉，另一个视图等真的切过去的时候再拉
  flatLoaded.value = false;
  folderLoaded.value = false;
  if (viewMode.value === "flat") loadFlat();
  else loadFolderAll();
}

watch(viewMode, (mode) => {
  openedMonth.value = "";
  if (mode === "folder" && !folderLoaded.value) loadFolderAll();
  if (mode === "flat" && !flatLoaded.value) loadFlat();
});

onMounted(async () => {
  factories.value = await listFactories();
  // 默认优先选"美奇"，列表里没有的话（比如换了环境）就不选，不会白屏选不出来——
  // 跟系统里其它玩具厂筛选器保持同一个习惯，不想看"美奇"可以自己清空切"全部"
  const preferred = factories.value.find((f) => f.name === "美奇");
  if (preferred) factoryId.value = preferred.id;
  if (viewMode.value === "folder") loadFolderAll();
  else loadFlat();
});
</script>

<template>
  <div class="gallery-page">
    <div class="filter-bar">
      <el-select v-model="factoryId" placeholder="全部玩具厂" clearable filterable style="width: 200px" @change="onFactoryChange">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>

      <el-radio-group v-model="viewMode" class="mode-switch">
        <el-radio-button value="flat">平铺</el-radio-button>
        <el-radio-button value="folder">按月份文件夹</el-radio-button>
      </el-radio-group>

      <template v-if="viewMode === 'flat'">
        <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 160px" @change="loadFlat">
          <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
        </el-select>
        <el-radio-group v-model="kind" @change="loadFlat">
          <el-radio-button value="">全部单据</el-radio-button>
          <el-radio-button value="inbound">入库单</el-radio-button>
          <el-radio-button value="outbound">出库单</el-radio-button>
        </el-radio-group>
        <span class="filter-count" v-if="!loading">共 {{ list.length }} 张</span>
      </template>
    </div>

    <div v-if="viewMode === 'flat'" v-loading="loading">
      <GalleryThumbGrid :items="list" />
    </div>

    <div v-else v-loading="folderLoading">
      <template v-if="!openedMonth">
        <div class="folder-grid">
          <div v-for="f in folders" :key="f.month" class="folder-card" @click="openFolder(f.month)">
            <el-icon class="folder-icon"><Folder /></el-icon>
            <div class="folder-month">{{ f.month }}</div>
            <div class="folder-counts">
              <span class="folder-count folder-count--in">入 {{ f.inboundCount }}</span>
              <span class="folder-count folder-count--out">出 {{ f.outboundCount }}</span>
            </div>
          </div>
        </div>
        <el-empty v-if="!folderLoading && !folders.length" description="没有单据照片" />
      </template>

      <template v-else>
        <div class="folder-breadcrumb">
          <el-button size="small" text type="primary" @click="backToFolders">
            <el-icon><ArrowLeft /></el-icon>
            返回文件夹
          </el-button>
          <span class="folder-breadcrumb-label">{{ openedMonth }}</span>
        </div>

        <div class="folder-section">
          <div class="folder-section-title">入库单（{{ openedMonthInbound.length }}）</div>
          <GalleryThumbGrid :items="openedMonthInbound" empty-text="这个月没有入库单照片" />
        </div>
        <div class="folder-section">
          <div class="folder-section-title">出库单（{{ openedMonthOutbound.length }}）</div>
          <GalleryThumbGrid :items="openedMonthOutbound" empty-text="这个月没有出库单照片" />
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.mode-switch {
  margin-left: 4px;
}

.filter-count {
  color: #909399;
  font-size: 13px;
}

.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
}

.folder-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 20px 10px;
  border-radius: 8px;
  background: #f8f9fb;
  cursor: pointer;
  transition: background 0.15s ease;
}

.folder-card:hover {
  background: #eef3fb;
}

.folder-icon {
  font-size: 36px;
  color: #e6a23c;
}

.folder-month {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.folder-counts {
  display: flex;
  gap: 8px;
  font-size: 12px;
}

.folder-count--in {
  color: #67c23a;
}

.folder-count--out {
  color: #409eff;
}

.folder-breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}

.folder-breadcrumb-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.folder-section {
  margin-bottom: 24px;
}

.folder-section-title {
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 10px;
}
</style>
