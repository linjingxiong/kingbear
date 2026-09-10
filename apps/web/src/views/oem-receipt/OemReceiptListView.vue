<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import type { CreateOemReceiptDto, FactoryListItem, OemFactory, OemReceiptListItem, Product } from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { createOemReceipt, deleteOemReceipt, listOemReceipts, updateOemReceipt, uploadOemReceiptImage } from "../../api/oem-receipt";

const oemFactories = ref<OemFactory[]>([]);
const list = ref<OemReceiptListItem[]>([]);
const loading = ref(false);

// 工序(货号)选择器的候选项——不限玩具厂，全量取一遍，标签上带一下货号+名称；
// 成品回收记的是"哪个代工厂交回了哪道工序的货多少"，物料对账按这道工序的配方算耗料
const productOptions = ref<Product[]>([]);
async function loadProductOptions() {
  const factories = await listFactories();
  const productLists = await Promise.all(factories.map((f: FactoryListItem) => listProductsByFactory(f.id)));
  productOptions.value = productLists.flat();
}

async function load() {
  loading.value = true;
  try {
    list.value = await listOemReceipts();
  } finally {
    loading.value = false;
  }
}

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateOemReceiptDto>({
  oemFactoryId: "",
  productId: "",
  qty: 0,
  receivedDate: "",
  images: [],
});

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  productId: [{ required: true, message: "请选择工序", trigger: "change" }],
  qty: [{ required: true, message: "请输入数量", trigger: "blur" }],
  receivedDate: [{ required: true, message: "请选择回收日期", trigger: "change" }],
};

function resetForm() {
  Object.assign(form, { oemFactoryId: "", productId: "", qty: 0, receivedDate: "", images: [] });
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: OemReceiptListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    oemFactoryId: row.oemFactoryId,
    productId: row.productId,
    qty: row.qty,
    receivedDate: (row.receivedDate ?? "").slice(0, 10),
    images: [...row.images],
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createOemReceipt(form);
  } else if (editingId.value) {
    await updateOemReceipt(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: OemReceiptListItem) {
  await ElMessageBox.confirm(`确定删除这条「${row.oemFactoryName} · ${row.productName}」的回收记录吗？`, "二次确认", {
    type: "warning",
  });
  await deleteOemReceipt(row.id);
  ElMessage.success("已删除");
  load();
}

const uploadingCount = ref(0);
async function customUpload(options: UploadRequestOptions) {
  uploadingCount.value++;
  try {
    const { url } = await uploadOemReceiptImage(options.file as File);
    form.images!.push(url);
  } finally {
    uploadingCount.value--;
  }
}

function removeImage(index: number) {
  form.images!.splice(index, 1);
}

onMounted(async () => {
  oemFactories.value = await listOemFactories();
  await loadProductOptions();
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增成品回收</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border size="small">
      <el-table-column prop="oemFactoryName" label="代工厂" width="140" />
      <el-table-column prop="productSku" label="货号" width="120" />
      <el-table-column prop="productName" label="工序名称" show-overflow-tooltip />
      <el-table-column label="数量" width="100" align="right">
        <template #default="{ row }">{{ row.qty.toLocaleString() }}</template>
      </el-table-column>
      <el-table-column label="回收日期" width="120">
        <template #default="{ row }">{{ (row.receivedDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column label="凭证" width="160">
        <template #default="{ row }">
          <div v-if="row.images.length" class="thumb-list">
            <el-image
              v-for="url in row.images"
              :key="url"
              :src="url"
              :preview-src-list="row.images"
              preview-teleported
              fit="cover"
              class="thumb"
            />
          </div>
          <span v-else class="no-image">无</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增成品回收' : '编辑成品回收'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="代工厂" prop="oemFactoryId">
          <el-select v-model="form.oemFactoryId" style="width: 100%">
            <el-option v-for="f in oemFactories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="工序" prop="productId">
          <el-select v-model="form.productId" filterable style="width: 100%">
            <el-option v-for="p in productOptions" :key="p.id" :label="`${p.sku} · ${p.name}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量" prop="qty">
          <el-input-number v-model="form.qty" :min="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="回收日期" prop="receivedDate">
          <el-date-picker v-model="form.receivedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="凭证图片">
          <div class="image-uploader">
            <el-upload
              :show-file-list="false"
              accept="image/*"
              multiple
              :http-request="customUpload"
              :disabled="uploadingCount > 0"
            >
              <el-button :loading="uploadingCount > 0">
                <el-icon><Plus /></el-icon>
                上传凭证图片
              </el-button>
            </el-upload>
            <div v-if="form.images?.length" class="image-list">
              <div v-for="(url, idx) in form.images" :key="url" class="image-item">
                <el-image :src="url" :preview-src-list="form.images" preview-teleported fit="cover" class="thumb-lg" />
                <el-icon class="remove-icon" @click="removeImage(idx)"><CircleClose /></el-icon>
              </div>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 12px;
}

.thumb-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}

.no-image {
  color: #c0c4cc;
  font-size: 13px;
}

.image-uploader {
  width: 100%;
}

.image-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.image-item {
  position: relative;
}

.thumb-lg {
  width: 64px;
  height: 64px;
  border-radius: 4px;
  cursor: zoom-in;
}

.remove-icon {
  position: absolute;
  top: -6px;
  right: -6px;
  background: #fff;
  border-radius: 50%;
  color: #f56c6c;
  cursor: pointer;
  font-size: 16px;
}
</style>
