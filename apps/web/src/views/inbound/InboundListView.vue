<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, type UploadRequestOptions } from "element-plus";
import { InboundStatus, type FactoryListItem, type InboundRecord, type SearchInboundQuery } from "@kingbear/shared";
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

function itemsQty(row: InboundRecord) {
  return row.items.reduce((sum, i) => sum + i.qtyFinal, 0);
}

function itemsAmount(row: InboundRecord) {
  return row.items.reduce((sum, i) => sum + i.amount, 0);
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
      <el-table v-loading="loading" :data="list" border>
        <el-table-column prop="code" label="入库单号" width="160" />
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
        <el-table-column label="加工数量" width="100" align="right">
          <template #default="{ row }">{{ itemsQty(row) }}</template>
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
</style>
