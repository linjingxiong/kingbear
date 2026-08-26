<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import { ElMessage, ElMessageBox, type UploadRequestOptions } from "element-plus";
import {
  calculateQuantity,
  hasBigQuantityDiff,
  InboundStatus,
  type FactoryListItem,
  type InboundItem,
  type InboundRecord,
  type Product,
  type SearchInboundQuery,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { deleteInbound, searchInbound, uploadInboundImage } from "../../api/inbound";

const router = useRouter();

const factories = ref<FactoryListItem[]>([]);
const products = ref<Product[]>([]); // 当前选中玩具厂下的产品，给"货号"下拉框用
const list = ref<InboundRecord[]>([]);
const total = ref(0);
const loading = ref(false);
const uploading = ref(false);

// 不带 code（入库单号）和 productName（产品名称），这两个筛选项已经去掉了
const query = reactive<Omit<SearchInboundQuery, "code" | "productName">>({
  factoryId: undefined,
  dateFrom: dayjs().startOf("month").format("YYYY-MM-DD"),
  dateTo: dayjs().endOf("month").format("YYYY-MM-DD"),
  sku: undefined,
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
  if (!query.factoryId && factories.value.length) {
    // 默认优先选"美奇"，列表里没有的话再退回选第一个
    const preferred = factories.value.find((f) => f.name === "美奇");
    query.factoryId = (preferred ?? factories.value[0]).id;
  }
}

async function loadProducts() {
  products.value = query.factoryId ? await listProductsByFactory(query.factoryId) : [];
}

async function onFactoryChange() {
  query.sku = undefined; // 换了玩具厂，原来选的货号可能不属于新厂，清掉避免选中一个看不见的值
  await loadProducts();
  handleSearch();
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

// 不依赖入库确认时存的 hasQuantityDiff 快照，直接拿当前的重量/克重/数量现算一遍——
// 就算是很早以前录入、当时判断标准还比较松的旧数据，现在打开列表也一样能被拦出来提醒
function isBigQtyDiff(item: InboundItem) {
  return hasBigQuantityDiff(item.qtyFinal, calculateQuantity(item.weightJin, item.unitWeightG));
}

interface FlatRow {
  record: InboundRecord;
  item: InboundItem | null;
}

/**
 * 一单里好几个货号原来是挤在同一行的"加工数量"格子里用换行区分，看着像一条数据、
 * 其实是好几条挤在一起。这里按货号拆成一行一行独立的表格行（不合并单元格，玩具厂/
 * 入库日期这些信息每行都各自完整显示）——一条数据就是一行，跟别的列表页一致。
 * 没有货号明细的单据（识别中/待确认，items 还是空的）也给一行占位，不会凭空消失。
 */
const flatRows = computed<FlatRow[]>(() =>
  list.value.flatMap((record) => {
    const items = record.items.length ? record.items : [null];
    return items.map((item) => ({ record, item }));
  }),
);

// 只标这一个货号自己那一行，不再把整单一起高亮——现在一个货号就是一行，精确到行了
function rowClassName({ row }: { row: FlatRow }) {
  return row.item && isBigQtyDiff(row.item) ? "qty-diff-row" : "";
}

onMounted(async () => {
  await loadFactories();
  await loadProducts();
  load();
});
</script>

<template>
  <div>
    <!-- 原来是一大块拖拽上传区域，太占地方，改成一个小按钮 -->
    <div class="upload-bar">
      <el-upload :show-file-list="false" accept="image/*" :http-request="customUpload" :disabled="uploading">
        <el-button type="primary" :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入入库单图片
        </el-button>
      </el-upload>
    </div>

    <!-- 查询条件和列表原来是两张卡片，合并成一张，看着是一个整体 -->
    <el-card>
      <el-form :model="query" inline class="search-form">
        <el-form-item label="玩具厂">
          <el-select v-model="query.factoryId" clearable placeholder="全部" style="width: 180px" @change="onFactoryChange">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="query.dateFrom" type="date" placeholder="起" value-format="YYYY-MM-DD" style="width: 140px" @change="handleSearch" />
        </el-form-item>
        <el-form-item label="至">
          <el-date-picker v-model="query.dateTo" type="date" placeholder="止" value-format="YYYY-MM-DD" style="width: 140px" @change="handleSearch" />
        </el-form-item>
        <el-form-item label="货号">
          <el-select v-model="query.sku" clearable filterable placeholder="全部" style="width: 140px" @change="handleSearch">
            <el-option v-for="p in products" :key="p.sku" :label="`${p.sku} · ${p.name}`" :value="p.sku" />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="flatRows" border :row-class-name="rowClassName">
        <el-table-column label="玩具厂" width="160">
          <template #default="{ row }: { row: FlatRow }">
            {{ factories.find((f) => f.id === row.record.factoryId)?.name ?? (row.record.needFactorySelect ? "待选择" : "-") }}
          </template>
        </el-table-column>
        <el-table-column label="入库日期" width="120">
          <template #default="{ row }: { row: FlatRow }">{{ row.record.inboundDate?.slice(0, 10) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }: { row: FlatRow }">
            <el-tag :type="statusMeta[row.record.status as InboundStatus].type">
              {{ statusMeta[row.record.status as InboundStatus].text }}
            </el-tag>
          </template>
        </el-table-column>
        <!-- 货号数量原来挤在一个格子里用换行区分，现在一个货号一行，是真实的表格行了 -->
        <el-table-column label="货号" width="100">
          <template #default="{ row }: { row: FlatRow }">{{ row.item?.sku ?? "-" }}</template>
        </el-table-column>
        <el-table-column label="名称" width="140" show-overflow-tooltip>
          <template #default="{ row }: { row: FlatRow }">{{ row.item?.name ?? "-" }}</template>
        </el-table-column>
        <el-table-column label="加工数量" width="140">
          <template #default="{ row }: { row: FlatRow }">
            <template v-if="row.item">
              {{ row.item.qtyFinal }}
              <el-tooltip
                v-if="isBigQtyDiff(row.item)"
                content="跟按重量算出来的数量相差超过 1%，很可能录错了，建议进去核对"
              >
                <el-icon class="qty-diff-icon"><WarningFilled /></el-icon>
              </el-tooltip>
            </template>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="加工金额" width="120" align="right">
          <template #default="{ row }: { row: FlatRow }">
            <span v-if="row.item">¥{{ row.item.amount.toFixed(2) }}</span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }: { row: FlatRow }">
            <el-button link type="primary" @click="openRecord(row.record)">
              {{ row.record.status === "completed" ? "查看/修改" : "去确认" }}
            </el-button>
            <el-button link type="danger" @click="handleDelete(row.record)">删除</el-button>
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
.upload-bar {
  margin-bottom: 16px;
}

.search-form {
  margin-bottom: 12px;
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
