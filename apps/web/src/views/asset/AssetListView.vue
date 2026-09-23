<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import type { Asset, CreateAssetDto } from "@kingbear/shared";
import { createAsset, deleteAsset, listAssets, updateAsset, uploadAssetImage } from "../../api/asset";
import { listOemFactories } from "../../api/oem-factory";
import { createAssetType, listAssetTypes } from "../../api/asset-type";

const list = ref<Asset[]>([]);
const loading = ref(false);

// 资产管理人还是存自由文本（数据库不用改），只是录入时给个下拉方便选，不用每次手打名字。
// 现在只有代工厂这一种来源；以后有了"工人"这个角色，再加一个分组就行，不用改数据结构
const oemFactoryNames = ref<string[]>([]);
const custodianOptions = computed(() => [{ label: "代工厂", options: oemFactoryNames.value }]);

async function loadOemFactoryNames() {
  oemFactoryNames.value = (await listOemFactories()).map((f) => f.name);
}

// 资产名称：单独维护一份"资产类型"名录（见 asset-type 模块），下拉里选；
// 输入一个名录里没有的新名字，保存的时候顺手把它记进名录，下次就能直接选了——
// 不用另开一个"资产类型管理"页面来回切换
const assetTypeNames = ref<string[]>([]);

async function loadAssetTypeNames() {
  assetTypeNames.value = (await listAssetTypes()).map((t) => t.name);
}

/** 表单里填的资产名称如果是名录里没有的新名字，先存进资产类型名录 */
async function ensureAssetType(name: string) {
  const trimmed = name.trim();
  if (trimmed && !assetTypeNames.value.includes(trimmed)) {
    await createAssetType({ name: trimmed });
    assetTypeNames.value.push(trimmed);
  }
}

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
  await ensureAssetType(form.name);
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

onMounted(() => {
  load();
  loadOemFactoryNames();
  loadAssetTypeNames();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增资产领用</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border size="small">
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
          <!-- filterable + allow-create：能从代工厂里选，也能直接手打名字（比如玩具厂自己的人），
               不会因为下拉里没有这个名字就选不了 -->
          <el-select
            v-model="form.custodian"
            filterable
            allow-create
            default-first-option
            placeholder="选择代工厂，或直接输入姓名"
            style="width: 100%"
          >
            <el-option-group v-for="group in custodianOptions" :key="group.label" :label="group.label">
              <el-option v-for="name in group.options" :key="name" :label="name" :value="name" />
            </el-option-group>
          </el-select>
        </el-form-item>
        <el-form-item label="资产名称" prop="name">
          <!-- 从资产类型名录里选；输错找不到就直接打新名字，保存时会顺手记进名录，下次就有了 -->
          <el-select
            v-model="form.name"
            filterable
            allow-create
            default-first-option
            placeholder="选择资产类型，或直接输入新类型"
            style="width: 100%"
          >
            <el-option v-for="name in assetTypeNames" :key="name" :label="name" :value="name" />
          </el-select>
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
