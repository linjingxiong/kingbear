<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import {
  calculateQuantity,
  hasBigQuantityDiff,
  type CreateOemReceiptDto,
  type FactoryListItem,
  type OemFactory,
  type OemReceiptListItem,
  type Product,
  type ProductGroup,
} from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listFactories } from "../../api/factory";
import { listProductGroupsByFactory } from "../../api/product-group";
import { listProductsByFactory } from "../../api/product";
import { createOemReceipt, deleteOemReceipt, listOemReceipts, recognizeOemReceipt, updateOemReceipt } from "../../api/oem-receipt";
import { useImageZoomPan } from "../../composables/useImageZoomPan";

// 回收单预览图：滚轮缩放 + 拖拽平移，跟入库确认页单据图片那套交互一样
// （模板里 ref 只有作为顶层 setup 绑定才会自动解包，所以这里解构出来，不要整个对象一起传）
const {
  zoomLevel: slipZoomLevel,
  isDragging: slipDragging,
  style: slipStyle,
  reset: resetSlipZoom,
  onWheel: onSlipWheel,
  onMouseDown: onSlipMouseDown,
  onClick: onSlipClick,
} = useImageZoomPan();

const oemFactories = ref<OemFactory[]>([]);
// 产品/工序都是按玩具厂分的，回收时可以收任意玩具厂的产品，所以全量取一遍
const productGroups = ref<(ProductGroup & { factoryName: string })[]>([]);
const allSteps = ref<Product[]>([]);
const list = ref<OemReceiptListItem[]>([]);
const loading = ref(false);

async function loadProductGroups() {
  const factories: FactoryListItem[] = await listFactories();
  const [groupLists, stepLists] = await Promise.all([
    Promise.all(factories.map((f) => listProductGroupsByFactory(f.id))),
    Promise.all(factories.map((f) => listProductsByFactory(f.id))),
  ]);
  productGroups.value = groupLists.flatMap((groups, i) => groups.map((g) => ({ ...g, factoryName: factories[i].name })));
  allSteps.value = stepLists.flat();
}

// 选中产品后，工序(货号)下拉的候选项 = 归到这个产品下面的工序
const stepOptions = computed(() => allSteps.value.filter((s) => s.productGroupId === form.productGroupId));

async function load() {
  loading.value = true;
  try {
    list.value = await listOemReceipts();
  } finally {
    loading.value = false;
  }
}

/* ---------- 弹窗（一张回收单 = 一个代工厂 + 一个产品 + 多行工序，可批量提交） ----------
   数量跟入库单一样是"重量(斤) ÷ 单个克重(g)"换算出来的，qtyDeclared 是单据/识别到的数量
   （可编辑，留空就用公式算），qtyFinal() 拿到的才是最终要保存的数量 */
type RowItem = { productId: string; weightJin: number; unitWeightG: number; qtyDeclared: number | null; ocrName: string };

function qtyCalculated(row: RowItem) {
  return calculateQuantity(row.weightJin, row.unitWeightG);
}
function qtyFinal(row: RowItem) {
  return row.qtyDeclared ?? qtyCalculated(row);
}
function hasDiff(row: RowItem) {
  return row.qtyDeclared != null && row.qtyDeclared !== qtyCalculated(row);
}
function hasBigDiff(row: RowItem) {
  return row.qtyDeclared != null && hasBigQuantityDiff(row.qtyDeclared, qtyCalculated(row));
}
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({
  oemFactoryId: "",
  productGroupId: "",
  receivedDate: "",
  remark: "",
  imageUrl: "",
  rows: [] as RowItem[],
});
const uploading = ref(false);

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  productGroupId: [{ required: true, message: "请选择产品", trigger: "change" }],
  receivedDate: [{ required: true, message: "请选择回收日期", trigger: "change" }],
};

/* ---------- 草稿：弹窗内容自动存到这台设备的浏览器，防止没录完刷新丢失 ---------- */
const DRAFT_KEY = "kingbear-oem-receipt-draft";
const draftAvailable = ref(false);

function formHasContent() {
  return !!(
    form.oemFactoryId ||
    form.productGroupId ||
    form.receivedDate ||
    form.remark ||
    form.imageUrl ||
    form.rows.some((r) => r.productId || r.weightJin > 0 || r.unitWeightG > 0 || r.qtyDeclared || r.ocrName)
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
      receivedDate: d.receivedDate ?? "",
      remark: d.remark ?? "",
      imageUrl: d.imageUrl ?? "",
      rows:
        Array.isArray(d.rows) && d.rows.length
          ? d.rows
          : [{ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, ocrName: "" }],
    });
    draftAvailable.value = false;
    dialogVisible.value = true;
  } catch {
    ElMessage.error("草稿读取失败");
  }
}
async function discardDraft() {
  await ElMessageBox.confirm("确定丢弃这张没录完的回收草稿吗？", "确认", { type: "warning" });
  clearDraft();
}

watch(form, saveDraft, { deep: true });
// 图片换了（新建/识别/编辑/恢复草稿）就把缩放平移状态清掉，不然带着上一张图的缩放状态显示新图
watch(
  () => form.imageUrl,
  () => resetSlipZoom(),
);
watch(dialogVisible, (open) => {
  if (!open) checkDraft();
});

function resetForm() {
  Object.assign(form, { oemFactoryId: "", productGroupId: "", receivedDate: "", remark: "", imageUrl: "", rows: [] });
}
function addRow() {
  form.rows.push({ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, ocrName: "" });
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

function openEdit(row: OemReceiptListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    oemFactoryId: row.oemFactoryId,
    productGroupId: allSteps.value.find((s) => s.id === row.productId)?.productGroupId ?? "",
    receivedDate: (row.receivedDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
    imageUrl: row.images[0] ?? "",
    rows: [
      {
        productId: row.productId,
        weightJin: row.weightJin ?? 0,
        unitWeightG: row.unitWeightG ?? 0,
        qtyDeclared: row.qtyDeclared ?? row.qty,
        ocrName: "",
      },
    ],
  });
  dialogVisible.value = true;
}

// 换产品时，原来选的工序可能不属于新产品，清掉
function onProductGroupChange() {
  const ids = new Set(stepOptions.value.map((s) => s.id));
  for (const row of form.rows) {
    if (row.productId && !ids.has(row.productId)) row.productId = "";
  }
}

// 识别到的货号/名称跟系统里的工序模糊匹配——同一张单据识别文字可能有细微出入，
// 货号能精确对上最可靠，对不上再按名字"谁包含谁"来判定
function fuzzyMatchStep(text: string, steps: Product[]): Product | null {
  const t = text.trim();
  if (!t) return null;
  const bySku = steps.find((s) => s.sku === t);
  if (bySku) return bySku;
  const byName = steps.find((s) => s.name === t);
  if (byName) return byName;
  const partial = steps.find(
    (s) =>
      (s.sku.length >= 2 && (t.includes(s.sku) || s.sku.includes(t))) ||
      (s.name.length >= 2 && t.length >= 2 && (t.includes(s.name) || s.name.includes(t))),
  );
  return partial ?? null;
}

// 拍照识别：上传 → OCR → 预填代工厂/产品/日期/工序行（按货号或名字匹配，匹配不到留空让人工选）
async function onOcrUpload(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    const r = await recognizeOemReceipt(options.file as File);
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
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) form.receivedDate = r.date;

    form.rows = r.items.length
      ? r.items.map((it) => {
          const matched = fuzzyMatchStep(it.skuOrName, stepOptions.value);
          return {
            productId: matched?.id ?? "",
            weightJin: it.weightJin,
            unitWeightG: it.unitWeightG,
            qtyDeclared: it.qtyDeclared,
            ocrName: it.skuOrName,
          };
        })
      : [{ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, ocrName: "" }];

    dialogVisible.value = true;
    ElMessage.success("识别完成，请核对后保存");
  } finally {
    uploading.value = false;
  }
}

async function handleSubmit() {
  await formRef.value?.validate();
  // 重量必填，克重、数量都选填——数量没填就按公式算，克重不填算出来是0，等以后知道了再补
  const valid = form.rows.filter((r) => r.productId && r.weightJin > 0);
  if (!valid.length) {
    ElMessage.warning("请至少填一行工序，并填写重量(斤)");
    return;
  }

  if (dialogMode.value === "create") {
    for (const row of valid) {
      const dto: CreateOemReceiptDto = {
        oemFactoryId: form.oemFactoryId,
        productId: row.productId,
        weightJin: row.weightJin,
        unitWeightG: row.unitWeightG,
        qtyDeclared: row.qtyDeclared,
        qty: qtyFinal(row),
        receivedDate: form.receivedDate,
        remark: form.remark,
        images: form.imageUrl ? [form.imageUrl] : [],
      };
      await createOemReceipt(dto);
    }
  } else if (editingId.value) {
    const row = valid[0];
    await updateOemReceipt(editingId.value, {
      oemFactoryId: form.oemFactoryId,
      productId: row.productId,
      weightJin: row.weightJin,
      unitWeightG: row.unitWeightG,
      qtyDeclared: row.qtyDeclared,
      qty: qtyFinal(row),
      receivedDate: form.receivedDate,
      remark: form.remark,
    });
  }
  ElMessage.success("保存成功");
  clearDraft();
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

onMounted(async () => {
  checkDraft();
  oemFactories.value = await listOemFactories();
  await loadProductGroups();
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增成品回收</el-button>
      <el-upload :show-file-list="false" accept="image/*" :http-request="onOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入回收单图片
        </el-button>
      </el-upload>
    </div>

    <el-alert v-if="draftAvailable" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
      <template #title>
        有一张没录完的回收草稿（上次意外关闭 / 刷新时自动存下的）
        <el-button link type="primary" @click="restoreDraft">恢复</el-button>
        <el-button link type="danger" @click="discardDraft">丢弃</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="list" stripe size="small">
      <el-table-column label="回收日期" width="120">
        <template #default="{ row }">{{ (row.receivedDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column prop="oemFactoryName" label="代工厂" width="140" />
      <el-table-column prop="productSku" label="货号" width="100" />
      <el-table-column prop="productName" label="工序名称" show-overflow-tooltip />
      <el-table-column label="重量(斤)" width="90" align="right">
        <template #default="{ row }">{{ row.weightJin || "-" }}</template>
      </el-table-column>
      <el-table-column label="克重(g)" width="90" align="right">
        <template #default="{ row }">{{ row.unitWeightG || "-" }}</template>
      </el-table-column>
      <el-table-column label="数量" width="110" align="right">
        <template #default="{ row }">
          {{ row.qty.toLocaleString() }}
          <el-tooltip
            v-if="row.qtyDeclared != null && hasBigQuantityDiff(row.qtyDeclared, calculateQuantity(row.weightJin, row.unitWeightG))"
            content="跟按重量算出来的数量相差超过5个，很可能录错了，建议核对"
          >
            <el-icon class="diff-icon"><WarningFilled /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="凭证" width="70" align="center">
        <template #default="{ row }">
          <el-image
            v-if="row.images.length"
            :src="row.images[0]"
            :preview-src-list="row.images"
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

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增成品回收' : '编辑成品回收'" width="760px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="form.imageUrl" label="回收单">
          <div
            class="slip-frame"
            :class="{ 'slip-frame--zoomed': slipZoomLevel > 1, 'slip-frame--dragging': slipDragging }"
            @click="onSlipClick"
            @wheel.prevent="onSlipWheel"
            @mousedown="onSlipMouseDown"
          >
            <img :src="form.imageUrl" class="slip-preview-img" :style="slipStyle" draggable="false" />
          </div>
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
        <el-form-item label="回收日期" prop="receivedDate">
          <el-date-picker v-model="form.receivedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="工序明细">
          <div class="rows-editor">
            <div class="mat-row mat-row--header">
              <span class="col-label" style="width: 220px">工序</span>
              <span class="col-label col-label--required" style="width: 110px">重量(斤)</span>
              <span class="col-label" style="width: 110px">克重(g)</span>
              <span class="col-label" style="width: 110px">数量</span>
            </div>
            <div v-for="(row, idx) in form.rows" :key="idx" class="mat-row">
              <el-select
                v-model="row.productId"
                filterable
                :disabled="!form.productGroupId"
                :placeholder="row.ocrName ? `识别为：${row.ocrName}` : '选择工序'"
                style="width: 220px"
              >
                <el-option v-for="s in stepOptions" :key="s.id" :label="`${s.sku} · ${s.name}`" :value="s.id" />
              </el-select>
              <el-input-number v-model="row.weightJin" :min="0" :precision="3" placeholder="重量(斤)" controls-position="right" style="width: 110px" />
              <el-input-number v-model="row.unitWeightG" :min="0" :precision="3" placeholder="克重(g)" controls-position="right" style="width: 110px" />
              <el-input-number v-model="row.qtyDeclared" :min="0" placeholder="数量" controls-position="right" style="width: 110px" />
              <el-tag v-if="hasDiff(row)" :type="hasBigDiff(row) ? 'danger' : 'warning'" size="small">
                与算出来的（{{ qtyCalculated(row) }}）不一致
              </el-tag>
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
/* 回收单预览：滚轮缩放 + 拖拽平移，跟入库确认页单据图片同一套交互，
   固定尺寸的框 + overflow:hidden 裁掉超出部分，交互事件绑在框上（不是图片本身）——
   图片实际渲染尺寸经常比框小，事件只挂图片上的话空白区域滚轮/拖拽会没反应 */
.slip-frame {
  position: relative;
  width: 100%;
  max-width: 560px;
  height: 220px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.slip-frame--zoomed {
  cursor: grab;
}

.slip-frame--dragging {
  cursor: grabbing;
}

.slip-preview-img {
  display: block;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  user-select: none;
  pointer-events: none;
}
.muted {
  color: #c0c4cc;
}
.diff-icon {
  color: #f56c6c;
  margin-left: 2px;
  vertical-align: middle;
  cursor: help;
}
.rows-editor {
  width: 100%;
}
.mat-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.mat-row--header {
  margin-bottom: 4px;
}

.col-label {
  font-size: 12px;
  color: #909399;
}

.col-label--required::before {
  content: "*";
  color: #f56c6c;
  margin-right: 2px;
}
</style>
