<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import type { Asset, CreateAssetDto } from "@kingbear/shared";
import { createAsset, deleteAsset, listAssets, updateAsset, uploadAssetImage } from "../../api/asset";

const list = ref<Asset[]>([]);
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    list.value = await listAssets();
  } finally {
    loading.value = false;
  }
}

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateAssetDto>({
  custodian: "",
  name: "",
  qty: 1,
  location: "",
  checkoutDate: "",
  images: [],
});

const rules = {
  custodian: [{ required: true, message: "请输入资产管理人", trigger: "blur" }],
  name: [{ required: true, message: "请输入资产名称", trigger: "blur" }],
  qty: [{ required: true, message: "请输入数量", trigger: "blur" }],
  location: [{ required: true, message: "请输入存放地点", trigger: "blur" }],
  checkoutDate: [{ required: true, message: "请选择领用时间", trigger: "change" }],
};

function resetForm() {
  Object.assign(form, { custodian: "", name: "", qty: 1, location: "", checkoutDate: "", images: [] });
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: Asset) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    custodian: row.custodian,
    name: row.name,
    qty: row.qty,
    location: row.location,
    checkoutDate: (row.checkoutDate ?? "").slice(0, 10),
    images: [...row.images],
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createAsset(form);
  } else if (editingId.value) {
    await updateAsset(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: Asset) {
  await ElMessageBox.confirm(`确定删除资产「${row.name}」这条领用记录吗？`, "二次确认", { type: "warning" });
  await deleteAsset(row.id);
  ElMessage.success("已删除");
  load();
}

// 凭证图片可以传不止一张——el-upload 开了 multiple 之后每个文件各自触发一次这个函数，
// 上传完直接把 URL 追加进表单的 images 数组，不用等全部传完再一起处理
const uploadingCount = ref(0);
async function customUpload(options: UploadRequestOptions) {
  uploadingCount.value++;
  try {
    const { url } = await uploadAssetImage(options.file as File);
    form.images!.push(url);
  } finally {
    uploadingCount.value--;
  }
}

function removeImage(index: number) {
  form.images!.splice(index, 1);
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增资产领用</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="custodian" label="资产管理人" width="120" />
      <el-table-column prop="name" label="资产名称" show-overflow-tooltip />
      <el-table-column prop="qty" label="数量" width="80" align="right" />
      <el-table-column prop="location" label="存放地点" width="140" show-overflow-tooltip />
      <el-table-column label="领用时间" width="120">
        <template #default="{ row }">{{ (row.checkoutDate ?? "").slice(0, 10) }}</template>
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

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增资产领用' : '编辑资产领用'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="资产管理人" prop="custodian">
          <el-input v-model="form.custodian" placeholder="领用人" />
        </el-form-item>
        <el-form-item label="资产名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="数量" prop="qty">
          <el-input-number v-model="form.qty" :min="0" controls-position="right" style="width: 160px" />
        </el-form-item>
        <el-form-item label="存放地点" prop="location">
          <el-input v-model="form.location" />
        </el-form-item>
        <el-form-item label="领用时间" prop="checkoutDate">
          <el-date-picker v-model="form.checkoutDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
                上传收据/签字图片
              </el-button>
            </el-upload>
            <div v-if="form.images?.length" class="image-list">
              <div v-for="(url, idx) in form.images" :key="url" class="image-item">
                <el-image :src="url" :preview-src-list="form.images" preview-teleported fit="cover" class="thumb" />
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
  width: 36px;
  height: 36px;
  border-radius: 4px;
  cursor: zoom-in;
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

.image-item .thumb {
  width: 64px;
  height: 64px;
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
