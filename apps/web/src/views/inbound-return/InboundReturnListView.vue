<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type UploadRequestOptions } from "element-plus";
import {
  calculateQuantity,
  hasBigQuantityDiff,
  type CreateInboundReturnDto,
  type FactoryListItem,
  type InboundReturnListItem,
  type OutboundKind,
  type Product,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { createInboundReturn, deleteInboundReturn, listInboundReturns, recognizeInboundReturn, updateInboundReturn } from "../../api/inbound-return";
import { useImageZoomPan } from "../../composables/useImageZoomPan";

// 出库单（玩具厂开的）：一张单里有两种行——"发料"（发原料/半成品给我加工，只做记录）和
// "退货"（不合格的货退回来，会从应收账单里扣）。这个页面最早只管退货，后来把发料也做进来，
// 文件名/接口名沿用没改，库里的老记录都是退货（没有 kind 字段的当退货处理）。
// 出库单预览图：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互
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

const KIND_LABEL: Record<OutboundKind, string> = { issue: "发料", return: "退货" };
// el-table 插槽里的 row 是 any，直接 KIND_LABEL[row.kind] 过不了类型检查，包一层函数
function kindLabel(kind: OutboundKind) {
  return KIND_LABEL[kind];
}
// 列表上方的类型筛选：空字符串 = 全部
const kindFilter = ref<"" | OutboundKind>("");
const filteredList = computed(() => (kindFilter.value ? list.value.filter((r) => r.kind === kindFilter.value) : list.value));

// 单据上写的是"次品/退货/不合格"这类字眼的行，多半是退货，识别出来时预选"退货"省得一行行手动改；
// 预选错了行内的类型下拉自己能改，只是个建议，不是自动判定
const RETURN_HINT = /次品|退货|退回|不良|不合格|返工/;

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

/* ---------- 弹窗（一张出库单 = 一个玩具厂 + 多行货号，可批量提交） ----------
   数量跟入库单一样是"重量(斤) ÷ 单个克重(g)"换算出来的，qtyDeclared 是单据/识别到的数量
   （可编辑，留空就用公式算），qtyFinal() 拿到的才是最终要保存的数量 */
type RowItem = {
  kind: OutboundKind;
  productId: string;
  weightJin: number;
  unitWeightG: number;
  qtyDeclared: number | null;
  reason: string;
  ocrName: string;
};

// 新增一行默认"发料"：出库单里大部分是发料、偶尔夹几行退货，退货的那几行手动改一下
function blankRow(kind: OutboundKind = "issue"): RowItem {
  return { kind, productId: "", weightJin: 0, unitWeightG: 0, qtyDeclared: null, reason: "", ocrName: "" };
}

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
  returnDate: [{ required: true, message: "请选择出库日期", trigger: "change" }],
};

/* ---------- 草稿：弹窗内容自动存到这台设备的浏览器，防止没录完刷新丢失 ---------- */
// key 沿用之前"退货草稿"的名字没改：之前存下的没录完的草稿还能恢复出来
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
      // 改版之前存下的草稿没有 kind（那时候只有退货），恢复出来就当退货，别悄悄变成发料
      rows:
        Array.isArray(d.rows) && d.rows.length
          ? d.rows.map((r: Partial<RowItem>) => ({ ...blankRow("return"), ...r, kind: r.kind ?? "return" }))
          : [blankRow()],
    });
    draftAvailable.value = false;
    dialogVisible.value = true;
  } catch {
    ElMessage.error("草稿读取失败");
  }
}
async function discardDraft() {
  await ElMessageBox.confirm("确定丢弃这张没录完的出库草稿吗？", "确认", { type: "warning" });
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
  form.rows.push(blankRow());
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
        kind: row.kind ?? "return",
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
            kind: RETURN_HINT.test(it.name) ? ("return" as const) : ("issue" as const),
            productId: matched?.id ?? "",
            weightJin: it.weightJin,
            unitWeightG: it.unitWeightG,
            qtyDeclared: it.qtyDeclared,
            reason: "",
            ocrName: `${it.sku} ${it.name}`.trim(),
          };
        })
      : [blankRow()];

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
        kind: row.kind,
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
      kind: row.kind,
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
  await ElMessageBox.confirm(`确定删除这条「${row.factoryName} · ${row.sku}」的${KIND_LABEL[row.kind]}记录吗？`, "二次确认", {
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
      <el-button type="primary" @click="openCreate">新增出库单</el-button>
      <el-upload :show-file-list="false" accept="image/*" :http-request="onOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入出库单图片
        </el-button>
      </el-upload>
      <el-radio-group v-model="kindFilter" size="default" class="kind-filter">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="issue">发料</el-radio-button>
        <el-radio-button value="return">退货</el-radio-button>
      </el-radio-group>
    </div>

    <el-alert v-if="draftAvailable" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
      <template #title>
        有一张没录完的出库草稿（上次意外关闭 / 刷新时自动存下的）
        <el-button link type="primary" @click="restoreDraft">恢复</el-button>
        <el-button link type="danger" @click="discardDraft">丢弃</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="filteredList" stripe size="small">
      <el-table-column label="出库日期" width="120">
        <template #default="{ row }">{{ (row.returnDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.kind === 'return' ? 'danger' : 'primary'" size="small" effect="plain">{{ kindLabel(row.kind) }}</el-tag>
        </template>
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
      <!-- 发料不影响应收，金额没意义，不展示；退货的金额才是从应收里扣的那个数 -->
      <el-table-column label="退货金额" width="110" align="right">
        <template #default="{ row }">
          <template v-if="row.kind === 'return'">¥{{ row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) }}</template>
          <span v-else class="muted">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="reason" label="原因" width="120" show-overflow-tooltip />
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

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增出库单' : '编辑出库单'" width="min(980px, 95vw)">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="form.imageUrl" label="出库单">
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
        <el-form-item label="出库日期" prop="returnDate">
          <el-date-picker v-model="form.returnDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label="货号明细">
          <!-- 每一行固定用 grid 分栏，跟表头严格对齐，宽度不够就整体横向滚动，不会
               乱换行错位。重量(斤)/克重(g) 换算出来的"算出数量"直接摆一列常显——跟数量
               对不上就是红色，不用悬浮/点击才能看到，一眼就能核对是不是录错了 -->
          <div class="rows-editor">
            <div class="rows-grid rows-grid--header">
              <span class="col-label">货号</span>
              <span class="col-label col-label--required">重量(斤)</span>
              <span class="col-label">克重(g)</span>
              <span class="col-label">数量</span>
              <span class="col-label">算出数量</span>
              <span class="col-label">类型</span>
              <span class="col-label">原因</span>
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
              <!-- 重量(斤) ÷ 单个克重(g) 换算出来的数量，跟"数量"这一列不是一回事——
                   不一致就标红，方便对照原始单据核对到底是哪个数抄错了 -->
              <span class="calc-qty" :class="{ 'calc-qty--diff': hasDiff(row), 'calc-qty--big-diff': hasBigDiff(row) }">
                {{ qtyCalculated(row) }}
              </span>
              <!-- 这一行是发料还是退货：退货才会从应收账单里扣，所以每行都要看清楚选对 -->
              <el-select v-model="row.kind" style="width: 100%" :class="{ 'kind-select--return': row.kind === 'return' }">
                <el-option label="发料" value="issue" />
                <el-option label="退货" value="return" />
              </el-select>
              <el-input v-model="row.reason" :placeholder="row.kind === 'return' ? '比如：破损/色差' : '选填'" />
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
  /* 货号 / 重量 / 克重 / 数量 / 算出数量 / 类型 / 原因 / 操作 */
  grid-template-columns: 190px 95px 95px 95px 80px 90px 120px 60px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  min-width: 880px;
}

/* 选了"退货"的那一行，类型下拉框变红，一眼看出哪几行会从应收里扣钱 */
.kind-select--return :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1px #f56c6c inset;
}
.kind-select--return :deep(.el-select__selected-item) {
  color: #f56c6c;
}

.kind-filter {
  margin-left: auto;
}

.rows-grid--header {
  margin-bottom: 4px;
}

.calc-qty {
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: #909399;
}

.calc-qty--diff {
  color: #e6a23c;
}

.calc-qty--big-diff {
  color: #f56c6c;
  font-weight: 700;
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
