<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import type { InboundGalleryItem } from "@kingbear/shared";

// 单据缩略图网格：平铺视图、文件夹视图里"某个月的入库/出库照片"都用这一个，
// 不用在两个地方各写一遍卡片样式
const props = defineProps<{ items: InboundGalleryItem[]; emptyText?: string }>();

const previewList = computed(() => props.items.map((item) => item.imageUrl));

function dateLabel(iso: string) {
  return dayjs(iso).format("YYYY-MM-DD");
}
</script>

<template>
  <div class="gallery-grid">
    <div v-for="(item, idx) in items" :key="`${item.kind}:${item.recordId}`" class="gallery-card">
      <el-image
        :src="item.imageUrl"
        :preview-src-list="previewList" hide-on-click-modal
        :initial-index="idx"
        preview-teleported
        fit="cover"
        class="gallery-thumb"
        :style="{ transform: `rotate(${item.rotation}deg)` }"
        lazy
      />
      <div class="gallery-caption">
        <div class="gallery-caption-main">
          {{ item.factoryName }}
          <el-tag :type="item.kind === 'inbound' ? 'success' : 'primary'" size="small" effect="plain" class="gallery-kind-tag">
            {{ item.kind === "inbound" ? "入库" : "出库" }}
          </el-tag>
        </div>
        <div class="gallery-caption-sub">{{ dateLabel(item.inboundDate) }}</div>
      </div>
    </div>
  </div>
  <el-empty v-if="!items.length" :description="emptyText ?? '没有符合条件的单据照片'" />
</template>

<style scoped>
/* 像图片文件夹一样铺开：固定尺寸的方形缩略图自动换行，每张图配一小行说明文字 */
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  min-height: 60px;
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

.gallery-kind-tag {
  margin-left: 4px;
  vertical-align: 1px;
}

.gallery-caption-sub {
  color: #909399;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
