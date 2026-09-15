<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import { calculateQuantity, hasBigQuantityDiff, type CreateInboundReturnDto, type FactoryListItem, type InboundReturnListItem, type Product } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { createInboundReturn, deleteInboundReturn, listInboundReturns, recognizeInboundReturn, updateInboundReturn } from "../../api/inbound-return";
import { useImageZoomPan } from "../../composables/useImageZoomPan";

// 退货单预览图：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互
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

const factories = ref<FactoryListItem[]>([]);
const productsByFactory = ref<Product[]>([]);
const list = ref<InboundReturnListItem[]>([]);
const loading = ref(false);

// 退货货号只能是选中的这个玩具厂自己的产品，换厂要重新拉一遍
async function loadProducts(factoryId: string) {
  productsByFactory.value = factoryId ? await listProductsByFactory(factoryId) : [];
}

async function load() {
  loading.value = true;
  try {
    list.value = await listInboundReturns();
  } finally {
    loading.value = false;
  }
}

/* ---------- 弹窗（一张退货单 = 一个玩具厂 + 多行货号，可批量提交） ----------
   数量跟入库单一样是"重量(斤) ÷ 单个克重(g)"换算出来的，qtyDeclared 是单据/识别到的数量
   （可编辑，留空就用公式算），qtyFinal() 拿到的才是最终要保存的数量 */
type RowItem = { productId: string; weightJin: number; unitWeightG: number; qtyDeclared: number | null; reason: string; ocrName: string };

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
  factoryId: "",
  returnDate: "",
  remark: "",
  imageUrl: "",
  rows: [] as RowItem[],
});
const uploading = ref(false);

const rules = {
  factoryId: [{ required: true, message: "请选择玩具厂", trigger: "change" }],
  returnDate: [{ required: true, message: "请选择退货日期", trigger: "change" }],
};

/* ---------- 草稿：弹窗内容自动存到这台设备的浏览器，防止没录完刷新丢失 ---------- */
const DRAFT_KEY = "kingbear-inbound-return-draft";
const draftAvailable = ref(false);

function formHasContent() {
  return !!(
    form.factoryId ||
    form.returnDate ||
    form.remark ||
    form.imageUrl ||
    form.rows.some((r) => r.productId || r.weightJin > 0 || r.unitWeightG > 0 || r.qtyDeclared || r.reason || r.ocrName)
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
async function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    dialogMode.value = "create";
    editingId.value = null;
    if (d.factoryId) await loadProducts(d.factoryId);
    Object.assign(form, {
      factoryId: d.factoryId ?? "",
      returnDate: d.returnDate ?? "",
      remark: d.remark ?? "",
      imageUrl: d.imageUrl ?? "",
      rows:
        Array.isArray(d.rows) && d.rows.length
          ? d.rows
          : [{ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, reason: "", ocrName: "" }],
    });
    draftAvailable.value = false;
    dialogVisible.value = true;
  } catch {
    ElMessage.error("草稿读取失败");
  }
}
async function discardDraft() {
  await ElMessageBox.confirm("确定丢弃这张没录完的退货草稿吗？", "确认", { type: "warning" });
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
  Object.assign(form, {
    factoryId: "",
    returnDate: "",
    remark: "",
    imageUrl: "",
    rows: [],
  });
}
function addRow() {
  form.rows.push({ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, reason: "", ocrName: "" });
}
function removeRow(i: number) {
  form.rows.splice(i, 1);
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  productsByFactory.value = [];
  resetForm();
  addRow();
  dialogVisible.value = true;
}

async function openEdit(row: InboundReturnListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  await loadProducts(row.factoryId);
  Object.assign(form, {
    factoryId: row.factoryId,
    returnDate: (row.returnDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
    imageUrl: row.images[0] ?? "",
    rows: [
      {
        productId: row.productId ?? "",
        weightJin: row.weightJin ?? 0,
        unitWeightG: row.unitWeightG ?? 0,
        qtyDeclared: row.qtyDeclared ?? row.qty,
        reason: row.reason ?? "",
        ocrName: "",
      },
    ],
  });
  dialogVisible.value = true;
}

// 换玩具厂时，原来选的货号可能不属于新厂，清掉并重新拉一遍这个厂的产品
async function onFactoryChange() {
  await loadProducts(form.factoryId);
  const ids = new Set(productsByFactory.value.map((p) => p.id));
  for (const row of form.rows) {
    if (row.productId && !ids.has(row.productId)) row.productId = "";
  }
}

// 识别到的货号/名称跟这个玩具厂的产品模糊匹配——货号能精确对上最可靠，对不上再按名字"谁包含谁"来判定
function fuzzyMatchProduct(sku: string, name: string, products: Product[]): Product | null {
  const bySku = products.find((p) => p.sku === sku);
  if (bySku) return bySku;
  const byName = products.find((p) => p.name === name);
  if (byName) return byName;
  const t = (sku || name || "").trim();
  if (!t) return null;
  const partial = products.find(
    (p) =>
      (p.sku.length >= 2 && (t.includes(p.sku) || p.sku.includes(t))) ||
      (p.name.length >= 2 && t.length >= 2 && (t.includes(p.name) || p.name.includes(t))),
  );
  return partial ?? null;
}

// 拍照识别：退货单跟入库单长得一样，复用入库单的识别接口 → 预填玩具厂/日期/货号行
// （按货号或名字匹配，匹配不到留空让人工选）
async function onOcrUpload(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    const r = await recognizeInboundReturn(options.file as File);
    dialogMode.value = "create";
    editingId.value = null;
    resetForm();
    form.imageUrl = r.imageUrl;

    if (r.factoryName) {
      const f = factories.value.find((x) => x.name === r.factoryName || x.name.includes(r.factoryName!));
      if (f) {
        form.factoryId = f.id;
        await loadProducts(f.id);
      }
    }
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) form.returnDate = r.date;

    form.rows = r.items.length
      ? r.items.map((it) => {
          const matched = fuzzyMatchProduct(it.sku, it.name, productsByFactory.value);
          return {
            productId: matched?.id ?? "",
            weightJin: it.weightJin,
            unitWeightG: it.unitWeightG,
            qtyDeclared: it.qtyDeclared,
            reason: "",
            ocrName: `${it.sku} ${it.name}`.trim(),
          };
        })
      : [{ productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, reason: "", ocrName: "" }];

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
    ElMessage.warning("请至少填一行货号，并选好货号、填写重量(斤)");
    return;
  }

  if (dialogMode.value === "create") {
    for (const row of valid) {
      const product = productsByFactory.value.find((p) => p.id === row.productId);
      const dto: CreateInboundReturnDto = {
        factoryId: form.factoryId,
        productId: row.productId,
        sku: product?.sku ?? "",
        name: product?.name ?? "",
        weightJin: row.weightJin,
        unitWeightG: row.unitWeightG,
        qtyDeclared: row.qtyDeclared,
        qty: qtyFinal(row),
        factoryPrice: product?.factoryPrice ?? 0,
        returnDate: form.returnDate,
        reason: row.reason,
        remark: form.remark,
        images: form.imageUrl ? [form.imageUrl] : [],
      };
      await createInboundReturn(dto);
    }
  } else if (editingId.value) {
    const row = valid[0];
    const product = productsByFactory.value.find((p) => p.id === row.productId);
    await updateInboundReturn(editingId.value, {
      factoryId: form.factoryId,
      productId: row.productId,
      sku: product?.sku,
      name: product?.name,
      weightJin: row.weightJin,
      unitWeightG: row.unitWeightG,
      qtyDeclared: row.qtyDeclared,
      qty: qtyFinal(row),
      factoryPrice: product?.factoryPrice,
      returnDate: form.returnDate,
      reason: row.reason,
      remark: form.remark,
    });
  }

  ElMessage.success("保存成功");
  clearDraft();
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: InboundReturnListItem) {
  await ElMessageBox.confirm(`确定删除这条「${row.factoryName} · ${row.sku}」的退货记录吗？`, "二次确认", {
    type: "warning",
  });
  await deleteInboundReturn(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(async () => {
  checkDraft();
  factories.value = await listFactories();
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增退货</el-button>
      <el-upload :show-file-list="false" accept="image/*" :http-request="onOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入退货单图片
        </el-button>
      </el-upload>
    </div>

    <el-alert v-if="draftAvailable" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
      <template #title>
        有一张没录完的退货草稿（上次意外关闭 / 刷新时自动存下的）
        <el-button link type="primary" @click="restoreDraft">恢复</el-button>
        <el-button link type="danger" @click="discardDraft">丢弃</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="list" stripe size="small">
      <el-table-column label="退货日期" width="120">
        <template #default="{ row }">{{ (row.returnDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column prop="factoryName" label="玩具厂" width="140" />
      <el-table-column prop="sku" label="货号" width="100" />
      <el-table-column prop="name" label="名称" show-overflow-tooltip />
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
      <el-table-column label="金额" width="110" align="right">
        <template #default="{ row }">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="退货原因" width="120" show-overflow-tooltip />
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

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增退货' : '编辑退货'" width="min(880px, 95vw)">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="form.imageUrl" label="退货单">
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
        <el-form-item label="玩具厂" prop="factoryId">
          <el-select v-model="form.factoryId" filterable style="width: 100%" @change="onFactoryChange">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="退货日期" prop="returnDate">
          <el-date-picker v-model="form.returnDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="货号明细">
          <!-- 每一行固定用 grid 分栏，跟表头严格对齐；跟原来 flex-wrap 的写法不一样——
               宽度不够时是横向滚动，不会整行乱换行错位。数量差异提示原来是一整句文字的
               el-tag，OCR 批量识别时好几行都有差异、挤在一起太宽，反而是造成换行的主因，
               这里改成跟列表页一样的小图标+悬浮提示 -->
          <div class="rows-editor">
            <div class="rows-grid rows-grid--header">
              <span class="col-label">货号</span>
              <span class="col-label col-label--required">重量(斤)</span>
              <span class="col-label">克重(g)</span>
              <span class="col-label">数量</span>
              <span class="col-label">退货原因</span>
              <span class="col-label">操作</span>
            </div>
            <div v-for="(row, idx) in form.rows" :key="idx" class="rows-grid">
              <el-select
                v-model="row.productId"
                filterable
                :disabled="!form.factoryId"
                :placeholder="row.ocrName ? `识别为：${row.ocrName}` : '选择货号'"
                style="width: 100%"
              >
                <el-option v-for="p in productsByFactory" :key="p.id" :label="`${p.sku} · ${p.name}`" :value="p.id" />
              </el-select>
              <el-input-number v-model="row.weightJin" :min="0" :precision="3" controls-position="right" style="width: 100%" />
              <el-input-number v-model="row.unitWeightG" :min="0" :precision="3" controls-position="right" style="width: 100%" />
              <el-input-number v-model="row.qtyDeclared" :min="0" controls-position="right" style="width: 100%" />
              <el-input v-model="row.reason" placeholder="比如：破损/色差" />
              <div class="row-actions">
                <el-tooltip v-if="hasDiff(row)" :content="`与按重量算出来的（${qtyCalculated(row)}）不一致，${hasBigDiff(row) ? '相差较大，' : ''}建议核对`">
                  <el-icon class="diff-icon" :class="{ 'diff-icon--big': hasBigDiff(row) }"><WarningFilled /></el-icon>
                </el-tooltip>
                <el-button v-if="dialogMode === 'create'" link type="danger" @click="removeRow(idx)">删除</el-button>
              </div>
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
/* 退货单预览：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互，
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
  vertical-align: middle;
  cursor: help;
}
.diff-icon--big {
  color: #f56c6c;
  font-weight: 700;
}
.rows-editor {
  width: 100%;
  /* 货号+3个数字框+原因+操作，几列加起来比对话框窄的时候（比如手机端）就横向滚动，
     不要让每一行自己去做换行——换行会导致输入框跟表头错位，比滚动条更难用 */
  overflow-x: auto;
}
.rows-grid {
  display: grid;
  grid-template-columns: 200px 100px 100px 100px 130px 90px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  min-width: 720px;
}

.rows-grid--header {
  margin-bottom: 4px;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
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
