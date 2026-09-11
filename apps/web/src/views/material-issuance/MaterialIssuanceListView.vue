<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import type {
  CommonMaterial,
  CreateMaterialIssuanceDto,
  FactoryListItem,
  MaterialIssuanceListItem,
  OemFactory,
  ProductGroup,
} from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listFactories } from "../../api/factory";
import { listProductGroupsByFactory } from "../../api/product-group";
import { listCommonMaterials } from "../../api/common-material";
import {
  createMaterialIssuance,
  deleteMaterialIssuance,
  listMaterialIssuances,
  recognizeMaterialDispatch,
  updateMaterialIssuance,
} from "../../api/material-issuance";

const oemFactories = ref<OemFactory[]>([]);
const productGroups = ref<(ProductGroup & { factoryName: string })[]>([]);
const commonMaterials = ref<CommonMaterial[]>([]);
const list = ref<MaterialIssuanceListItem[]>([]);
const loading = ref(false);

async function loadProductGroups() {
  const factories: FactoryListItem[] = await listFactories();
  const lists = await Promise.all(factories.map((f) => listProductGroupsByFactory(f.id)));
  productGroups.value = lists.flatMap((groups, i) => groups.map((g) => ({ ...g, factoryName: factories[i].name })));
}

const productMaterialOptions = computed(
  () => productGroups.value.find((g) => g.id === form.productGroupId)?.materials ?? [],
);

/* ---------- 弹窗（一张发料单 = 一个代工厂 + 一个产品 + 多行物料，可批量提交） ---------- */
type MatRow = { materialRef: string; qty: number; ocrName: string };
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  oemFactoryId: "",
  productGroupId: "",
  issuedDate: "",
  remark: "",
  imageUrl: "",
  rows: [] as MatRow[],
});
const uploading = ref(false);

/* ---------- 草稿：弹窗内容自动存到这台设备的浏览器，防止没录完刷新丢失 ---------- */
const DRAFT_KEY = "kingbear-material-issuance-draft";
const draftAvailable = ref(false);

function formHasContent() {
  return !!(
    form.oemFactoryId ||
    form.productGroupId ||
    form.issuedDate ||
    form.remark ||
    form.imageUrl ||
    form.rows.some((r) => r.materialRef || r.qty > 0 || r.ocrName)
  );
}

function saveDraft() {
  try {
    if (dialogVisible.value && dialogMode.value === "create" && formHasContent()) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    }
  } catch {
    // 存不进去（隐私模式等）就算了，不影响本次录入
  }
}
function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
  draftAvailable.value = false;
}
function checkDraft() {
  try {
    draftAvailable.value = !!localStorage.getItem(DRAFT_KEY);
  } catch {
    draftAvailable.value = false;
  }
}
function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    dialogMode.value = "create";
    editingId.value = null;
    Object.assign(form, {
      oemFactoryId: d.oemFactoryId ?? "",
      productGroupId: d.productGroupId ?? "",
      issuedDate: d.issuedDate ?? "",
      remark: d.remark ?? "",
      imageUrl: d.imageUrl ?? "",
      rows: Array.isArray(d.rows) && d.rows.length ? d.rows : [{ materialRef: "", qty: 0, ocrName: "" }],
    });
    draftAvailable.value = false;
    dialogVisible.value = true;
  } catch {
    ElMessage.error("草稿读取失败");
  }
}
async function discardDraft() {
  await ElMessageBox.confirm("确定丢弃这张没录完的发料草稿吗？", "确认", { type: "warning" });
  clearDraft();
}

// 弹窗打开且在录入时，改动实时存草稿
watch(form, saveDraft, { deep: true });
// 弹窗关掉（取消/刷新）后，如果草稿还在，列表页顶部显示"恢复"入口
watch(dialogVisible, (open) => {
  if (!open) checkDraft();
});

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  productGroupId: [{ required: true, message: "请选择产品", trigger: "change" }],
  issuedDate: [{ required: true, message: "请选择发放日期", trigger: "change" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listMaterialIssuances();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, { oemFactoryId: "", productGroupId: "", issuedDate: "", remark: "", imageUrl: "", rows: [] });
}

function addRow() {
  form.rows.push({ materialRef: "", qty: 0, ocrName: "" });
}
function removeRow(i: number) {
  form.rows.splice(i, 1);
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  resetForm();
  addRow();
  dialogVisible.value = true;
}

function openEdit(row: MaterialIssuanceListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    oemFactoryId: row.oemFactoryId,
    productGroupId: row.productGroupId ?? "",
    issuedDate: (row.issuedDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
    imageUrl: row.imageUrl ?? "",
    rows: [
      {
        materialRef: row.productGroupId ? `p:${row.materialName}` : `c:${row.materialName}`,
        qty: row.qty,
        ocrName: "",
      },
    ],
  });
  dialogVisible.value = true;
}

// OCR 识别出来的物料名，跟录好的物料名做模糊匹配——同一张单据拍两次，识别文字都可能有
// 细微出入（多写"主体"两个字、少个"珠"字之类），完全相等太严格，先精确匹配，
// 不行就看谁包含谁（"主体后壳"包含"后壳"、"螺丝帽"是"螺丝帽珠"的一部分都算匹配上）
function fuzzyMatchName(ocrName: string, candidates: { name: string }[]): string | null {
  const name = ocrName.trim();
  if (!name) return null;
  const exact = candidates.find((c) => c.name === name);
  if (exact) return exact.name;
  // 短名字（1个字）互相包含太容易误判（"叶"会把"中叶""小叶""大叶"全匹配上），
  // 只在两边名字都至少2个字时才按"谁包含谁"来判定
  const partial = candidates.find(
    (c) => c.name.length >= 2 && name.length >= 2 && (name.includes(c.name) || c.name.includes(name)),
  );
  return partial ? partial.name : null;
}

// 拍照识别：上传 → OCR → 预填代工厂/产品/日期/物料行（按名字匹配，匹配不到留空让人工选）
async function onOcrUpload(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    const r = await recognizeMaterialDispatch(options.file as File);
    dialogMode.value = "create";
    editingId.value = null;
    resetForm();
    form.imageUrl = r.imageUrl;

    if (r.oemFactoryName) {
      const f = oemFactories.value.find((x) => x.name === r.oemFactoryName || x.name.includes(r.oemFactoryName!));
      if (f) form.oemFactoryId = f.id;
    }
    if (r.productName) {
      const g = productGroups.value.find((x) => x.name === r.productName || x.name.includes(r.productName!));
      if (g) form.productGroupId = g.id;
    }
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) form.issuedDate = r.date;

    form.rows = r.items.length
      ? r.items.map((it) => {
          const prodMatch = fuzzyMatchName(it.materialName, productMaterialOptions.value);
          const commonMatch = prodMatch ? null : fuzzyMatchName(it.materialName, commonMaterials.value);
          return {
            materialRef: prodMatch ? `p:${prodMatch}` : commonMatch ? `c:${commonMatch}` : "",
            qty: it.qty,
            ocrName: it.materialName,
          };
        })
      : [{ materialRef: "", qty: 0, ocrName: "" }];

    dialogVisible.value = true;
    ElMessage.success("识别完成，请核对后保存");
  } finally {
    uploading.value = false;
  }
}

function onProductGroupChange() {
  const names = new Set(productMaterialOptions.value.map((m) => m.name));
  for (const row of form.rows) {
    if (row.materialRef.startsWith("p:") && !names.has(row.materialRef.slice(2))) row.materialRef = "";
  }
}

async function handleSubmit() {
  await formRef.value?.validate();
  const valid = form.rows.filter((r) => r.materialRef && r.qty > 0);
  if (!valid.length) {
    ElMessage.warning("请至少填一行物料和数量");
    return;
  }

  if (dialogMode.value === "create") {
    for (const row of valid) {
      const isCommon = row.materialRef.startsWith("c:");
      const dto: CreateMaterialIssuanceDto = {
        oemFactoryId: form.oemFactoryId,
        materialName: row.materialRef.slice(2),
        qty: row.qty,
        issuedDate: form.issuedDate,
        remark: form.remark,
        imageUrl: form.imageUrl || undefined,
        ...(isCommon ? {} : { productGroupId: form.productGroupId }),
      };
      await createMaterialIssuance(dto);
    }
  } else if (editingId.value) {
    const row = valid[0];
    const isCommon = row.materialRef.startsWith("c:");
    await updateMaterialIssuance(editingId.value, {
      oemFactoryId: form.oemFactoryId,
      materialName: row.materialRef.slice(2),
      qty: row.qty,
      issuedDate: form.issuedDate,
      remark: form.remark,
      ...(isCommon ? {} : { productGroupId: form.productGroupId }),
    });
  }
  ElMessage.success("保存成功");
  clearDraft();
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: MaterialIssuanceListItem) {
  await ElMessageBox.confirm(
    `确定删除这条「${row.oemFactoryName} · ${row.productGroupName} · ${row.materialName}」的发料记录吗？`,
    "二次确认",
    { type: "warning" },
  );
  await deleteMaterialIssuance(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(async () => {
  checkDraft();
  oemFactories.value = await listOemFactories();
  await Promise.all([loadProductGroups(), listCommonMaterials().then((v) => (commonMaterials.value = v))]);
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增发料</el-button>
      <el-upload :show-file-list="false" accept="image/*" :http-request="onOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入发料单图片
        </el-button>
      </el-upload>
    </div>

    <el-alert v-if="draftAvailable" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
      <template #title>
        有一张没录完的发料草稿（上次意外关闭 / 刷新时自动存下的）
        <el-button link type="primary" @click="restoreDraft">恢复</el-button>
        <el-button link type="danger" @click="discardDraft">丢弃</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="list" border size="small">
      <el-table-column label="发放日期" width="120">
        <template #default="{ row }">{{ (row.issuedDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column prop="oemFactoryName" label="代工厂" width="130" />
      <el-table-column prop="productGroupName" label="产品 / 类型" width="130" />
      <el-table-column prop="materialName" label="物料" width="130" />
      <el-table-column label="数量" width="110" align="right">
        <template #default="{ row }">{{ row.qty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="凭证" width="70" align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.imageUrl"
            :src="row.imageUrl"
            :preview-src-list="[row.imageUrl]"
            preview-teleported
            fit="cover"
            class="thumb"
          />
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增发料' : '编辑发料'" width="620px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="form.imageUrl" label="发料单">
          <el-image :src="form.imageUrl" :preview-src-list="[form.imageUrl]" preview-teleported fit="contain" class="slip-preview" />
        </el-form-item>
        <el-form-item label="代工厂" prop="oemFactoryId">
          <el-select v-model="form.oemFactoryId" style="width: 100%">
            <el-option v-for="f in oemFactories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品" prop="productGroupId">
          <el-select v-model="form.productGroupId" filterable style="width: 100%" @change="onProductGroupChange">
            <el-option v-for="g in productGroups" :key="g.id" :label="`${g.name}（${g.factoryName}）`" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="发放日期" prop="issuedDate">
          <el-date-picker v-model="form.issuedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="物料明细">
          <div class="rows-editor">
            <div v-for="(row, idx) in form.rows" :key="idx" class="mat-row">
              <el-select
                v-model="row.materialRef"
                filterable
                :disabled="!form.productGroupId"
                :placeholder="row.ocrName ? `识别为：${row.ocrName}` : '选择物料'"
                style="width: 240px"
              >
                <el-option-group label="本产品物料">
                  <el-option
                    v-for="m in productMaterialOptions"
                    :key="`p:${m.name}`"
                    :label="`${m.name}${m.unit ? `（${m.unit}）` : ''}`"
                    :value="`p:${m.name}`"
                  />
                </el-option-group>
                <el-option-group label="通用物料">
                  <el-option
                    v-for="m in commonMaterials"
                    :key="`c:${m.name}`"
                    :label="`${m.name}（${m.unit}）`"
                    :value="`c:${m.name}`"
                  />
                </el-option-group>
              </el-select>
              <el-input-number v-model="row.qty" :min="0" :precision="2" controls-position="right" style="width: 130px" />
              <el-button v-if="dialogMode === 'create'" link type="danger" @click="removeRow(idx)">删除</el-button>
            </div>
            <el-button v-if="dialogMode === 'create'" @click="addRow">+ 添加一行</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
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
  display: flex;
  gap: 12px;
}
.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}
.slip-preview {
  max-width: 100%;
  max-height: 200px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
}
.muted {
  color: #c0c4cc;
}
.rows-editor {
  width: 100%;
}
.mat-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
</style>
