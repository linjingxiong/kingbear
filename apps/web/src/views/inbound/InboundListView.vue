<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, type UploadRequestOptions } from "element-plus";
import {
  calculateQuantity,
  hasBigQuantityDiff,
  InboundStatus,
  type FactoryListItem,
  type InboundItem,
  type InboundRecord,
  type SearchInboundQuery,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { deleteInbound, searchInbound, uploadInboundImage } from "../../api/inbound";

const router = useRouter();

const factories = ref<FactoryListItem[]>([]);
const list = ref<InboundRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const uploading = ref(false);

const query = reactive<SearchInboundQuery>({
  factoryId: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  productName: undefined,
  sku: undefined,
  code: undefined,
  page: 1,
  pageSize: 20,
});

const statusMeta: Record<InboundStatus, { text: string; type: "info" | "warning" | "success" }> = {
  [InboundStatus.Processing]: { text: "识别中", type: "info" },
  [InboundStatus.PendingConfirm]: { text: "待确认", type: "warning" },
  [InboundStatus.Completed]: { text: "已完成", type: "success" },
};

async function loadFactories() {
  factories.value = await listFactories();
}

async function load() {
  loading.value = true;
  try {
    const result = await searchInbound(query);
    list.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  query.page = 1;
  load();
}

function handleReset() {
  Object.assign(query, {
    factoryId: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    productName: undefined,
    sku: undefined,
    code: undefined,
    page: 1,
  });
  load();
}

async function customUpload(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    const record = await uploadInboundImage(options.file as File);
    ElMessage.success("上传成功，正在跳转到确认页");
    router.push(`/inbound/${record.id}/confirm`);
  } finally {
    uploading.value = false;
  }
}

function openRecord(row: InboundRecord) {
  router.push(`/inbound/${row.id}/confirm`);
}

async function handleDelete(row: InboundRecord) {
  await ElMessageBox.confirm(`确定删除入库单「${row.code}」吗？删除后不可恢复。`, "二次确认", {
    type: "warning",
  });
  await deleteInbound(row.id);
  ElMessage.success("已删除");
  load();
}

function itemsAmount(row: InboundRecord) {
  return row.items.reduce((sum, i) => sum + i.amount, 0);
}

// 不依赖入库确认时存的 hasQuantityDiff 快照，直接拿当前的重量/克重/数量现算一遍——
// 就算是很早以前录入、当时判断标准还比较松的旧数据，现在打开列表也一样能被拦出来提醒
function isBigQtyDiff(item: InboundItem) {
  return hasBigQuantityDiff(item.qtyFinal, calculateQuantity(item.weightJin, item.unitWeightG));
}

// 小图标太不显眼，容易被忽略——只要这一单里有任意一个货号数量差异较大，整行都高亮，
// 一眼扫过去就能看出这单有问题，不用凑近了一个个找感叹号
function rowClassName({ row }: { row: InboundRecord }) {
  return row.items.some(isBigQtyDiff) ? "qty-diff-row" : "";
}

onMounted(() => {
  loadFactories();
  load();
});
</script>

<template>
  <div>
    <el-card class="upload-card">
      <el-upload
        drag
        :show-file-list="false"
        accept="image/*"
        :http-request="customUpload"
        :disabled="uploading"
      >
        <div v-loading="uploading" class="upload-inner">
          <el-icon size="28"><Plus /></el-icon>
          <div>点击或拖拽上传入库单图片</div>
        </div>
      </el-upload>
    </el-card>

    <el-card class="search-card">
      <el-form :model="query" inline>
        <el-form-item label="玩具厂">
          <el-select v-model="query.factoryId" clearable placeholder="全部" style="width: 180px">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="query.dateFrom" type="date" placeholder="起" value-format="YYYY-MM-DD" style="width: 140px" />
        </el-form-item>
        <el-form-item label="至">
          <el-date-picker v-model="query.dateTo" type="date" placeholder="止" value-format="YYYY-MM-DD" style="width: 140px" />
        </el-form-item>
        <el-form-item label="产品名称">
          <el-input v-model="query.productName" clearable style="width: 140px" />
        </el-form-item>
        <el-form-item label="货号">
          <el-input v-model="query.sku" clearable style="width: 120px" />
        </el-form-item>
        <el-form-item label="入库单号">
          <el-input v-model="query.code" clearable style="width: 160px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card>
      <el-table v-loading="loading" :data="list" border :row-class-name="rowClassName">
        <el-table-column label="玩具厂" width="160">
          <template #default="{ row }">
            {{ factories.find((f) => f.id === row.factoryId)?.name ?? (row.needFactorySelect ? "待选择" : "-") }}
          </template>
        </el-table-column>
        <el-table-column label="入库日期" width="120">
          <template #default="{ row }">{{ row.inboundDate?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusMeta[row.status as InboundStatus].type">
              {{ statusMeta[row.status as InboundStatus].text }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="加工数量" width="160">
          <template #default="{ row }">
            <!-- 一单可能有好几个不同货号，数量分开列出来，不合成一个总数——不然不同货号
                 混在一起加总，数字看着大但没什么实际意义 -->
            <div v-for="item in row.items" :key="item.sku" class="qty-line">
              {{ item.sku }}：{{ item.qtyFinal }}
              <el-tooltip
                v-if="isBigQtyDiff(item)"
                content="跟按重量算出来的数量相差超过 1%，很可能录错了，建议进去核对"
              >
                <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="加工金额" width="120" align="right">
          <template #default="{ row }">¥{{ itemsAmount(row).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openRecord(row)">
              {{ row.status === "completed" ? "查看/修改" : "去确认" }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        style="margin-top: 12px; justify-content: flex-end"
        layout="prev, pager, next, total"
        :current-page="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="(p: number) => { query.page = p; load(); }"
      />
    </el-card>
  </div>
</template>

<style scoped>
.upload-card,
.search-card {
  margin-bottom: 16px;
}

.upload-inner {
  padding: 24px;
  color: #909399;
}

.qty-line {
  line-height: 1.6;
  white-space: nowrap;
}

.qty-diff-icon {
  color: #f56c6c;
  margin-left: 4px;
  vertical-align: middle;
  cursor: help;
}

/* row-class-name 加到的是 el-table 内部真实的 <tr>，不在这个组件的模板里，
   scoped 样式默认选不中，要用 :deep() 穿透进去 */
:deep(.qty-diff-row td) {
  background-color: #fef0f0;
}
</style>
