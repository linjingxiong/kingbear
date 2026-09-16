<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import dayjs from "dayjs";
import type { FactoryListItem, InboundGalleryItem } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { getInboundGallery } from "../../api/inbound";

const factories = ref<FactoryListItem[]>([]);
const factoryId = ref<string>("");
// 账期下拉：最近12个月 + "全部"，"全部"就是空字符串不传 yearMonth，跟应收账单那个选择器同一个思路
const monthOptions = Array.from({ length: 12 }, (_, i) => dayjs().subtract(i, "month").format("YYYY-MM"));
const yearMonth = ref<string>("");

const list = ref<InboundGalleryItem[]>([]);
const loading = ref(false);

// 相册预览用：当前筛选结果里所有图片的 URL，点开任意一张都能在同一批里左右翻页看，
// 不用退出来重新点下一张
const previewList = computed(() => list.value.map((item) => item.imageUrl));

async function load() {
  loading.value = true;
  try {
    list.value = await getInboundGallery({
      factoryId: factoryId.value || undefined,
      yearMonth: yearMonth.value || undefined,
    });
  } finally {
    loading.value = false;
  }
}

function dateLabel(iso: string) {
  return dayjs(iso).format("YYYY-MM-DD");
}

onMounted(async () => {
  factories.value = await listFactories();
  load();
});
</script>

<template>
  <div class="gallery-page">
    <div class="filter-bar">
      <el-select v-model="factoryId" placeholder="全部玩具厂" clearable filterable style="width: 200px" @change="load">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-select v-model="yearMonth" placeholder="全部时间" clearable style="width: 160px" @change="load">
        <el-option v-for="m in monthOptions" :key="m" :label="m" :value="m" />
      </el-select>
      <span class="filter-count" v-if="!loading">共 {{ list.length }} 张</span>
    </div>

    <div v-loading="loading" class="gallery-grid">
      <div v-for="(item, idx) in list" :key="item.recordId" class="gallery-card">
        <el-image
          :src="item.imageUrl"
          :preview-src-list="previewList"
          :initial-index="idx"
          preview-teleported
          fit="cover"
          class="gallery-thumb"
          :style="{ transform: `rotate(${item.rotation}deg)` }"
          lazy
        />
        <div class="gallery-caption">
          <div class="gallery-caption-main">{{ item.factoryName }}</div>
          <div class="gallery-caption-sub">{{ dateLabel(item.inboundDate) }} · {{ item.code }}</div>
        </div>
      </div>
    </div>
    <el-empty v-if="!loading && !list.length" description="没有符合条件的入库单照片" />
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

.filter-count {
  color: #909399;
  font-size: 13px;
}

/* 像图片文件夹一样铺开：固定尺寸的方形缩略图自动换行，每张图配一小行说明文字 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  min-height: 120px;
}

.gallery-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  overflow: hidden;
}

.gallery-caption-main {
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-caption-sub {
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
