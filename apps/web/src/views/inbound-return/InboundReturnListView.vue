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
  type ProductGroup,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { listProductGroupsByFactory, updateProductGroup } from "../../api/product-group";
import { submitWithDuplicateConfirm } from "../../utils/duplicate-confirm";
import {
  createInboundReturn,
  deleteInboundReturn,
  listInboundReturns,
  recognizeInboundReturn,
  recognizeOutboundIssue,
  updateInboundReturn,
} from "../../api/inbound-return";
import { useImageZoomPan } from "../../composables/useImageZoomPan";

// 出库单（玩具厂开的）：一张单里有两种行，记的东西完全不是一回事——
// "发料"：玩具厂发原材料给我加工，原料没有货号，按"物料名称+重量(斤)"记，只做记录；
// "退货"：不合格的成品/半成品退回来，按货号记（跟入库单同一套字段），会从应收账单里扣。
// 这个页面最早只管退货，后来把发料也做进来，文件名/接口名沿用没改，库里的老记录都是退货
//（没有 kind 字段的当退货处理）。
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
// 发料这批物料是给这个玩具厂哪个产品用的（选填），选了产品，物料名称就能从这个产品的
// 物料清单里下拉选，不用每次手打——跟这个产品自己的"产品管理"页是同一份物料清单
const productGroups = ref<ProductGroup[]>([]);
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

// 退货货号只能是选中的这个玩具厂自己的产品，换厂要重新拉一遍
async function loadProducts(factoryId: string) {
  productsByFactory.value = factoryId ? await listProductsByFactory(factoryId) : [];
}

async function loadProductGroups(factoryId: string) {
  productGroups.value = factoryId ? await listProductGroupsByFactory(factoryId) : [];
}

/** 这一行选了产品，物料下拉就是这个产品的物料清单；没选产品就没有下拉候选，还是能手打 */
function materialOptionsFor(row: RowItem): string[] {
  return productGroups.value.find((g) => g.id === row.productGroupId)?.materials.map((m) => m.name) ?? [];
}

/** 发料行填的物料名称，如果这个产品的物料清单里还没有，保存时顺手记进这个产品的物料清单，
 * 下次同一个产品就能直接选了——跟"资产类型"名录是同一个思路 */
async function ensureMaterialInGroup(row: RowItem) {
  if (row.kind !== "issue" || !row.productGroupId) return;
  const group = productGroups.value.find((g) => g.id === row.productGroupId);
  const name = row.materialName.trim();
  if (!group || !name || group.materials.some((m) => m.name === name)) return;
  const updated = await updateProductGroup(group.id, { materials: [...group.materials, { name, unit: "" }] });
  Object.assign(group, updated);
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
  /** 退货专用：选中的货号（工序） */
  productId: string;
  /** 发料专用：物料名称，原材料没有货号 */
  materialName: string;
  /** 发料专用、选填：这批料是哪个产品用的 */
  productGroupId: string;
  /** 重量(斤)：两种类型都用得到 */
  weightJin: number;
  /** 退货专用：单个克重(g)，用来从重量换算件数 */
  unitWeightG: number;
  /** 退货专用：单据上写的数量 */
  qtyDeclared: number | null;
  reason: string;
  ocrName: string;
};

// 新增一行默认"发料"：出库单里大部分是发料、偶尔夹几行退货，退货的那几行手动改一下
function blankRow(kind: OutboundKind = "issue"): RowItem {
  return {
    kind,
    productId: "",
    materialName: "",
    productGroupId: "",
    weightJin: 0,
    unitWeightG: 0,
    qtyDeclared: null,
    reason: "",
    ocrName: "",
  };
}

// 出库单里的行是发料还是退货混着——发料要看是不是全都不需要克重/数量这些字段，
// 全都是发料的时候，表单里那几列直接不显示，省得看着一堆用不上的"-"
const hasReturnRows = computed(() => form.rows.some((r) => r.kind === "return"));

/**
 * 这一批里有没有手滑录重的：同样是发料，物料名称+重量一样；同样是退货，货号+数量一样，
 * 大概率是同一行被多录了一遍（比如拍照识别把手写的一行拆成两行，或者手动加行的时候点重了）。
 * 这只查"这批还没保存的行之间"有没有重复，跟保存时后端查"是不是跟数据库里已存的记录重复"
 * 是两回事，互不替代——这个能在动手保存之前就看出来，不用等提交了才知道。
 */
interface DuplicateGroup {
  key: string;
  label: string;
  /** 命中这一组重复的行号（从 0 开始），用来标红对应的行 */
  indexes: number[];
}
const duplicateGroups = computed<DuplicateGroup[]>(() => {
  const groups = new Map<string, DuplicateGroup>();
  form.rows.forEach((row, idx) => {
    let key: string;
    let label: string;
    if (row.kind === "issue") {
      const name = row.materialName.trim();
      if (!name || row.weightJin <= 0) return;
      key = `issue:${name}:${row.weightJin}`;
      label = `发料 · 物料「${name}」· 重量 ${row.weightJin} 斤`;
    } else {
      if (!row.productId || row.weightJin <= 0) return;
      const product = productsByFactory.value.find((p) => p.id === row.productId);
      const qty = qtyFinal(row);
      key = `return:${row.productId}:${qty}`;
      label = `退货 · 货号「${product?.sku ?? "未知"}」· 数量 ${qty}`;
    }
    const g = groups.get(key) ?? { key, label, indexes: [] };
    g.indexes.push(idx);
    groups.set(key, g);
  });
  return [...groups.values()].filter((g) => g.indexes.length > 1);
});
const duplicateRowIndexes = computed(() => new Set(duplicateGroups.value.flatMap((g) => g.indexes)));

// 换了产品，原来选的物料名称可能不属于新产品的物料清单，清掉避免记串
function onRowProductGroupChange(row: RowItem) {
  row.materialName = "";
  // 一批发料大多数是同一个产品，记住这次选的，后面新增的行直接带上、不用每行重选；
  // 顺手把这一批里还没选产品的其他行也一起填上（比如拍照识别一次性出来一堆空产品的行），
  // 已经手动选过别的产品的行不动，不会覆盖掉手动选择
  lastIssueProductGroupId.value = row.productGroupId;
  for (const r of form.rows) {
    if (r !== row && r.kind === "issue" && !r.productGroupId) r.productGroupId = row.productGroupId;
  }
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
// 记着这批发料最近一次选的产品，新增行、批量识别出来的空产品行都直接带上这个默认值——
// 不用同一个产品在每一行都重选一遍；每次重新开一张新出库单（resetForm）就清空，不会带到下一张单上
const lastIssueProductGroupId = ref("");

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
    form.rows.some(
      (r) =>
        r.productId ||
        r.materialName ||
        r.productGroupId ||
        r.weightJin > 0 ||
        r.unitWeightG > 0 ||
        r.qtyDeclared ||
        r.reason ||
        r.ocrName,
    )
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
  lastIssueProductGroupId.value = "";
}
function addRow() {
  // 新增的行直接带上这批最近选的产品，省得同一个产品每行都要重选一遍
  form.rows.push({ ...blankRow(), productGroupId: lastIssueProductGroupId.value });
}
function removeRow(i: number) {
  form.rows.splice(i, 1);
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  productsByFactory.value = [];
  productGroups.value = [];
  resetForm();
  addRow();
  dialogVisible.value = true;
}

async function openEdit(row: InboundReturnListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  await Promise.all([loadProducts(row.factoryId), loadProductGroups(row.factoryId)]);
  Object.assign(form, {
    factoryId: row.factoryId,
    returnDate: (row.returnDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
    imageUrl: row.images[0] ?? "",
    rows: [
      {
        kind: row.kind ?? "return",
        productId: row.productId ?? "",
        materialName: row.materialName ?? "",
        productGroupId: row.productGroupId ?? "",
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

// 换玩具厂时，原来选的货号/产品可能不属于新厂，清掉并重新拉一遍这个厂的产品和产品清单
async function onFactoryChange() {
  await Promise.all([loadProducts(form.factoryId), loadProductGroups(form.factoryId)]);
  const productIds = new Set(productsByFactory.value.map((p) => p.id));
  const groupIds = new Set(productGroups.value.map((g) => g.id));
  for (const row of form.rows) {
    if (row.productId && !productIds.has(row.productId)) row.productId = "";
    if (row.productGroupId && !groupIds.has(row.productGroupId)) row.productGroupId = "";
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

// 拍照识别·退货：退货单跟入库单长得一样，复用入库单的识别接口 → 预填玩具厂/日期/货号行
// （按货号或名字匹配，匹配不到留空让人工选）。这个入口识别到的都是退货，不用再猜类型
async function onReturnOcrUpload(options: UploadRequestOptions) {
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
        // 产品清单也一起拉一下——万一某一行手动改成"发料"，产品下拉马上就有得选
        await Promise.all([loadProducts(f.id), loadProductGroups(f.id)]);
      }
    }
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) form.returnDate = r.date;

    form.rows = r.items.length
      ? r.items.map((it) => {
          const matched = fuzzyMatchProduct(it.sku, it.name, productsByFactory.value);
          return {
            ...blankRow("return"),
            productId: matched?.id ?? "",
            weightJin: it.weightJin,
            unitWeightG: it.unitWeightG,
            qtyDeclared: it.qtyDeclared,
            ocrName: `${it.sku} ${it.name}`.trim(),
          };
        })
      : [blankRow("return")];

    dialogVisible.value = true;
    ElMessage.success("识别完成，请核对后保存");
  } finally {
    uploading.value = false;
  }
}

// 拍照识别·发料：发的是原材料，识别模板跟退货完全不一样（物料名称+重量，没有货号/克重），
// 走单独的接口，识别到的行直接是"发料"，不用猜类型
async function onIssueOcrUpload(options: UploadRequestOptions) {
  uploading.value = true;
  try {
    const r = await recognizeOutboundIssue(options.file as File);
    dialogMode.value = "create";
    editingId.value = null;
    resetForm();
    form.imageUrl = r.imageUrl;

    if (r.factoryName) {
      const f = factories.value.find((x) => x.name === r.factoryName || x.name.includes(r.factoryName!));
      // 发料行不用选货号，这里仍然拉一下这个厂的产品列表——万一某一行手动改成"退货"，
      // 货号下拉能马上有选项，不用等用户重新碰一下玩具厂选择框才触发加载。产品清单也一起拉，
      // 方便识别完之后逐行补选"这批料是哪个产品的"
      if (f) {
        form.factoryId = f.id;
        await Promise.all([loadProducts(f.id), loadProductGroups(f.id)]);
      }
    }
    if (r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) form.returnDate = r.date;

    form.rows = r.items.length
      ? r.items.map((it) => ({ ...blankRow("issue"), materialName: it.materialName, weightJin: it.weightJin }))
      : [blankRow("issue")];

    dialogVisible.value = true;
    ElMessage.success("识别完成，请核对后保存");
  } finally {
    uploading.value = false;
  }
}

// 退货要选好货号、填重量；发料要填物料名称、填重量——两套字段各自的必填条件不一样
function rowIsValid(r: RowItem) {
  return r.kind === "return" ? !!r.productId && r.weightJin > 0 : !!r.materialName.trim() && r.weightJin > 0;
}

/** 一行的数据拼成要提交的字段（退货/发料两套完全不同的字段） */
function buildRowFields(row: RowItem) {
  if (row.kind === "return") {
    const product = productsByFactory.value.find((p) => p.id === row.productId);
    return {
      productId: row.productId,
      sku: product?.sku ?? "",
      name: product?.name ?? "",
      materialName: undefined,
      weightJin: row.weightJin,
      unitWeightG: row.unitWeightG,
      qtyDeclared: row.qtyDeclared,
      qty: qtyFinal(row),
      factoryPrice: product?.factoryPrice ?? 0,
    };
  }
  // 发料：原材料没有货号，qty 就直接等于重量(斤)——发料不参与账单，qty 只是满足字段必填
  return {
    productId: null,
    sku: "",
    name: "",
    materialName: row.materialName.trim(),
    productGroupId: row.productGroupId || null,
    weightJin: row.weightJin,
    unitWeightG: 0,
    qtyDeclared: null,
    qty: row.weightJin,
    factoryPrice: 0,
  };
}

async function handleSubmit() {
  await formRef.value?.validate();
  const valid = form.rows.filter(rowIsValid);
  if (!valid.length) {
    ElMessage.warning("请至少填好一行：退货要选货号+填重量(斤)，发料要填物料名称+填重量(斤)");
    return;
  }
  // 发料行填的物料名称，选了产品但物料清单里还没有的话，顺手记进这个产品的物料清单
  await Promise.all(valid.map(ensureMaterialInGroup));

  if (dialogMode.value === "create") {
    for (const row of valid) {
      const dto: CreateInboundReturnDto = {
        kind: row.kind,
        factoryId: form.factoryId,
        ...buildRowFields(row),
        returnDate: form.returnDate,
        reason: row.reason,
        remark: form.remark,
        images: form.imageUrl ? [form.imageUrl] : [],
      };
      await submitWithDuplicateConfirm(dto, createInboundReturn);
    }
  } else if (editingId.value) {
    const row = valid[0];
    await updateInboundReturn(editingId.value, {
      kind: row.kind,
      factoryId: form.factoryId,
      ...buildRowFields(row),
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
  const itemLabel = row.kind === "return" ? row.sku : row.materialName || row.name;
  await ElMessageBox.confirm(`确定删除这条「${row.factoryName} · ${itemLabel}」的${KIND_LABEL[row.kind]}记录吗？`, "二次确认", {
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
      <!-- 发料、退货是两种完全不同的单据（发料只有物料名+重量，退货是货号那一套），
           识别模板不一样，拆成两个导入入口，不用再靠关键词猜这一行到底是哪种 -->
      <el-upload :show-file-list="false" accept="image/*" :http-request="onIssueOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入发料单图片
        </el-button>
      </el-upload>
      <el-upload :show-file-list="false" accept="image/*" :http-request="onReturnOcrUpload" :disabled="uploading">
        <el-button :loading="uploading">
          <el-icon><Plus /></el-icon>
          导入退货单图片
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
      <el-table-column label="产品" width="110" show-overflow-tooltip>
        <template #default="{ row }">{{ row.kind === "issue" ? row.productGroupName || "-" : "-" }}</template>
      </el-table-column>
      <el-table-column label="货号" width="100">
        <template #default="{ row }">{{ row.kind === "return" ? row.sku : "-" }}</template>
      </el-table-column>
      <el-table-column label="名称 / 物料" show-overflow-tooltip>
        <template #default="{ row }">{{ row.kind === "return" ? row.name : row.materialName || row.name }}</template>
      </el-table-column>
      <el-table-column label="重量(斤)" width="90" align="right">
        <template #default="{ row }">{{ row.weightJin || "-" }}</template>
      </el-table-column>
      <el-table-column label="克重(g)" width="90" align="right">
        <template #default="{ row }">{{ row.kind === "return" ? row.unitWeightG || "-" : "-" }}</template>
      </el-table-column>
      <el-table-column label="数量" width="110" align="right">
        <template #default="{ row }">
          <template v-if="row.kind === 'return'">
            {{ row.qty.toLocaleString() }}
            <el-tooltip
              v-if="row.qtyDeclared != null && hasBigQuantityDiff(row.qtyDeclared, calculateQuantity(row.weightJin, row.unitWeightG))"
              content="跟按重量算出来的数量相差超过5个，很可能录错了，建议核对"
            >
              <el-icon class="diff-icon"><WarningFilled /></el-icon>
            </el-tooltip>
          </template>
          <span v-else class="muted">-</span>
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

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增出库单' : '编辑出库单'"
      :width="form.imageUrl ? 'min(1360px, 97vw)' : 'min(980px, 95vw)'"
    >
      <!-- 识别不准的时候要对着原图逐行核对，图片跟货号明细分两栏：图片这一栏钉在左边不跟着动，
           右边的明细自己滚，不会出现"看一眼图片、往下滚一下、图片就跑没了"的问题 -->
      <div class="dialog-body" :class="{ 'dialog-body--split': form.imageUrl }">
        <div v-if="form.imageUrl" class="image-col">
          <div
            class="slip-frame"
            :class="{ 'slip-frame--zoomed': slipZoomLevel > 1, 'slip-frame--dragging': slipDragging }"
            @click="onSlipClick"
            @wheel.prevent="onSlipWheel"
            @mousedown="onSlipMouseDown"
          >
            <img :src="form.imageUrl" class="slip-preview-img" :style="slipStyle" draggable="false" />
          </div>
          <div class="slip-hint">滚轮缩放、拖拽平移，对着原图核对识别结果</div>
        </div>

        <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="fields-col">
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
               对不上就是红色，不用悬浮/点击才能看到，一眼就能核对是不是录错了。
               克重(g)/数量/算出数量只有退货用得到，这一批要是全是发料，这三列就不显示，
               不用看一堆用不上的"-" -->
          <el-alert v-if="duplicateGroups.length" type="warning" show-icon :closable="false" class="dup-alert">
            <template #title>这批里有 {{ duplicateGroups.length }} 组疑似重复，对应的行已经标红</template>
            <div v-for="g in duplicateGroups" :key="g.key" class="dup-item">
              {{ g.label }} — 第 {{ g.indexes.map((i) => i + 1).join("、") }} 行
            </div>
          </el-alert>
          <div class="rows-editor">
            <div class="rows-grid rows-grid--header" :class="{ 'rows-grid--compact': !hasReturnRows }">
              <span class="col-label">产品</span>
              <span class="col-label">货号 / 物料</span>
              <span class="col-label col-label--required">重量(斤)</span>
              <template v-if="hasReturnRows">
                <span class="col-label">克重(g)</span>
                <span class="col-label">数量</span>
                <span class="col-label">算出数量</span>
              </template>
              <span class="col-label">类型</span>
              <span class="col-label">原因</span>
              <span class="col-label">操作</span>
            </div>
            <!-- 退货按货号选（工序，跟入库单一样）；发料是原材料，没有货号，先选这批料是哪个
                 产品用的（选填），物料名称就能从这个产品的物料清单里下拉选，选不到就直接打字，
                 保存时顺手记进这个产品的物料清单，下次就有了 -->
            <div
              v-for="(row, idx) in form.rows"
              :key="idx"
              class="rows-grid"
              :class="{ 'rows-grid--compact': !hasReturnRows, 'rows-grid--duplicate': duplicateRowIndexes.has(idx) }"
            >
              <el-select
                v-if="row.kind === 'issue'"
                v-model="row.productGroupId"
                filterable
                clearable
                :disabled="!form.factoryId"
                placeholder="产品（选填）"
                style="width: 100%"
                popper-class="tag-cloud-dropdown"
                @change="onRowProductGroupChange(row)"
              >
                <el-option v-for="g in productGroups" :key="g.id" :label="g.name" :value="g.id" />
              </el-select>
              <span v-else class="muted col-dash">-</span>

              <el-select
                v-if="row.kind === 'return'"
                v-model="row.productId"
                filterable
                :disabled="!form.factoryId"
                :placeholder="row.ocrName ? `识别为：${row.ocrName}` : '选择货号'"
                style="width: 100%"
              >
                <el-option v-for="p in productsByFactory" :key="p.id" :label="`${p.sku} · ${p.name}`" :value="p.id" />
              </el-select>
              <el-select
                v-else
                v-model="row.materialName"
                filterable
                allow-create
                default-first-option
                placeholder="物料名称"
                style="width: 100%"
                popper-class="tag-cloud-dropdown"
              >
                <el-option v-for="name in materialOptionsFor(row)" :key="name" :label="name" :value="name" />
              </el-select>

              <el-input-number v-model="row.weightJin" :min="0" :precision="3" controls-position="right" style="width: 100%" />

              <template v-if="hasReturnRows">
                <el-input-number
                  v-if="row.kind === 'return'"
                  v-model="row.unitWeightG"
                  :min="0"
                  :precision="3"
                  controls-position="right"
                  style="width: 100%"
                />
                <span v-else class="muted col-dash">-</span>

                <el-input-number
                  v-if="row.kind === 'return'"
                  v-model="row.qtyDeclared"
                  :min="0"
                  controls-position="right"
                  style="width: 100%"
                />
                <span v-else class="muted col-dash">-</span>

                <!-- 重量(斤) ÷ 单个克重(g) 换算出来的数量，只有退货用得到——发料只按重量记，
                     没有件数这回事 -->
                <span
                  v-if="row.kind === 'return'"
                  class="calc-qty"
                  :class="{ 'calc-qty--diff': hasDiff(row), 'calc-qty--big-diff': hasBigDiff(row) }"
                >
                  {{ qtyCalculated(row) }}
                </span>
                <span v-else class="muted col-dash">-</span>
              </template>

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
      </div>
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
/* 有原图的时候，弹窗分左右两栏：左边图片钉住不动，右边货号明细自己滚——
   识别不准要对着图片逐行核对时，图片不会跟着滚动条一起跑掉。没有图片（纯手工新增）
   就还是原来单栏的样子，不用为了对齐两栏硬留一块空白 */
.dialog-body--split {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}

.image-col {
  flex: 0 0 460px;
  position: sticky;
  top: 0;
}

.fields-col {
  flex: 1;
  min-width: 0;
  /* 右边这一栏自己滚，弹窗本身不用跟着变得超长——图片始终留在视口里 */
  max-height: 75vh;
  overflow-y: auto;
  padding-right: 4px;
}

.slip-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

/* 出库单预览：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互，
   固定尺寸的框 + overflow:hidden 裁掉超出部分，交互事件绑在框上（不是图片本身）——
   图片实际渲染尺寸经常比框小，事件只挂图片上的话空白区域滚轮/拖拽会没反应。
   分栏之后图片单独占一整列，尺寸比原来单栏挤在表单里时大不少，字迹能看得更清楚 */
.slip-frame {
  position: relative;
  width: 100%;
  height: min(640px, 75vh);
  border: 1px solid #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fafafa;
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
.col-dash {
  text-align: center;
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
  /* 产品 / 货号或物料 / 重量 / 克重 / 数量 / 算出数量 / 类型 / 原因 / 操作——
     这批里只要还有一行是退货，就用这套完整的 9 列 */
  grid-template-columns: 130px 180px 95px 95px 95px 80px 90px 120px 60px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  min-width: 970px;
}

/* 这批全是发料，克重/数量/算出数量三列用不上，直接不占地方：
   产品 / 物料 / 重量 / 类型 / 原因 / 操作，6 列 */
.rows-grid--compact {
  grid-template-columns: 160px 220px 100px 90px 140px 60px;
  min-width: 800px;
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

.dup-alert {
  margin-bottom: 10px;
}

.dup-item {
  font-size: 12px;
  line-height: 1.7;
}

/* 这一行跟这批里的另一行撞了（同样的物料/货号+同样的量），整行标红，一眼就能看出
   是手滑录重了——外扩一点内边距，不然红色只会紧贴着输入框边缘，很难注意到 */
.rows-grid--duplicate {
  background: #fef0f0;
  outline: 2px solid #f89898;
  outline-offset: 2px;
  border-radius: 4px;
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

/* 窄屏放不下两栏，图片挪到上面、明细挪到下面各占整行，图片钉住那套逻辑
   在窄屏上意义不大（本来也要整个弹窗一起滚），干脆退回自然排版 */
@media (max-width: 900px) {
  .dialog-body--split {
    flex-direction: column;
  }

  .image-col {
    flex-basis: auto;
    width: 100%;
    position: static;
  }

  .fields-col {
    max-height: none;
    overflow-y: visible;
  }

  .slip-frame {
    height: 260px;
  }
}
</style>

<!-- 产品/物料下拉的选项太多时逐个滚动很费劲，改成"标签墙"：把每个选项变成一个圆角小标签，
     横向排满一行再往下走，一眼看到一大片，点哪个是哪个，比竖着一条条滚快得多。
     下拉弹层是 teleport 到 body 上的，scoped 样式够不着，这里单独开一个不带 scoped 的
     style block，用 popper-class="tag-cloud-dropdown" 精确框定只影响这两个下拉，
     不会波及玩具厂/类型这些别的下拉框 -->
<style>
.tag-cloud-dropdown {
  min-width: 420px !important;
}

.tag-cloud-dropdown .el-select-dropdown__wrap {
  max-height: 360px;
}

.tag-cloud-dropdown .el-select-dropdown__list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px;
}

.tag-cloud-dropdown .el-select-dropdown__item {
  flex: 0 0 auto;
  width: auto;
  height: auto;
  line-height: 1.4;
  padding: 5px 14px;
  border-radius: 14px;
  background: #f2f3f5;
  white-space: nowrap;
}

.tag-cloud-dropdown .el-select-dropdown__item.is-hovering {
  background: #e6f0fd;
}

.tag-cloud-dropdown .el-select-dropdown__item.is-selected {
  background: #ecf5ff;
  color: #409eff;
  font-weight: 600;
}

.tag-cloud-dropdown .el-select-dropdown__item.is-disabled {
  opacity: 0.5;
}

@media (max-width: 480px) {
  .tag-cloud-dropdown {
    min-width: 260px !important;
  }
}
</style>
