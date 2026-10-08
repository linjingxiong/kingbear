<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
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
import { listProductGroupsByFactory } from "../../api/product-group";
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
// 列表上方的筛选：类型（空字符串=全部）、玩具厂、出库日期区间——跟入库单列表同一套筛选，
// 玩具厂默认选"美奇"、日期默认当月，不用每次自己选
const kindFilter = ref<"" | OutboundKind>("");
const listFactoryFilter = ref("");
const dateFrom = ref(dayjs().startOf("month").format("YYYY-MM-DD"));
const dateTo = ref(dayjs().endOf("month").format("YYYY-MM-DD"));
const filteredList = computed(() =>
  list.value.filter((r) => {
    if (kindFilter.value && r.kind !== kindFilter.value) return false;
    if (listFactoryFilter.value && r.factoryId !== listFactoryFilter.value) return false;
    const date = (r.returnDate ?? "").slice(0, 10);
    if (dateFrom.value && date < dateFrom.value) return false;
    if (dateTo.value && date > dateTo.value) return false;
    return true;
  }),
);

/**
 * 已经保存的记录里有没有疑似重复的——跟录入时"这一批还没提交的行互相比对"、保存时"跟数据库
 * 已有记录比对"是两回事：这个是把已经存进去的全部记录拉出来，两两比对一遍，不管是什么时候、
 * 怎么录进去的（哪怕是当时确认了"强制保存"的），只要现在看数据本身样子一样，就标出来。
 * 判断口径跟前两道查重一致：发料按"同厂+同天+同物料名+同重量"，退货按"同厂+同天+同货号+同数量"。
 */
interface ListDuplicateGroup {
  ids: string[];
  label: string;
}
const listDuplicateGroups = computed<ListDuplicateGroup[]>(() => {
  const groups = new Map<string, ListDuplicateGroup>();
  for (const r of list.value) {
    const day = (r.returnDate ?? "").slice(0, 10);
    if (!day) continue;
    let key: string;
    let label: string;
    if (r.kind === "issue") {
      const name = (r.materialName || r.name || "").trim();
      if (!name) continue;
      key = `issue:${r.factoryId}:${day}:${name}:${r.weightJin}`;
      label = `${r.factoryName} · ${day} · 发料 · 物料「${name}」· 重量 ${r.weightJin} 斤`;
    } else {
      if (!r.sku) continue;
      key = `return:${r.factoryId}:${day}:${r.sku}:${r.qty}`;
      label = `${r.factoryName} · ${day} · 退货 · 货号「${r.sku}」· 数量 ${r.qty}`;
    }
    const g = groups.get(key) ?? { ids: [], label };
    g.ids.push(r.id);
    groups.set(key, g);
  }
  return [...groups.values()].filter((g) => g.ids.length > 1);
});
/** 记录 id → 属于哪一组重复（拿组内的描述文案给 tooltip 用） */
const duplicateRecordMap = computed(() => {
  const m = new Map<string, string>();
  for (const g of listDuplicateGroups.value) for (const id of g.ids) m.set(id, g.label);
  return m;
});
function rowClassName({ row }: { row: InboundReturnListItem }) {
  return duplicateRecordMap.value.has(row.id) ? "row-is-duplicate" : "";
}

// 退货货号只能是选中的这个玩具厂自己的产品，换厂要重新拉一遍
async function loadProducts(factoryId: string) {
  productsByFactory.value = factoryId ? await listProductsByFactory(factoryId) : [];
}

async function loadProductGroups(factoryId: string) {
  productGroups.value = factoryId ? await listProductGroupsByFactory(factoryId) : [];
}

/** 物料名称下拉的候选：这个玩具厂名下所有产品的物料清单合在一起（去重），不再要求先选产品——
 * 候选从"产品管理"里各产品维护的物料清单来，这里只读不写；选不到就直接打字 */
function materialOptionsFor(): string[] {
  const names = new Set<string>();
  for (const g of productGroups.value) for (const m of g.materials) names.add(m.name);
  return [...names];
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
    weightJin: 0,
    unitWeightG: 0,
    qtyDeclared: null,
    reason: "",
    ocrName: "",
  };
}

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
    form.rows.some(
      (r) =>
        r.productId ||
        r.materialName ||
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
// （产品清单还是要拉——物料名称下拉的候选来自这个厂各产品的物料清单）
async function onFactoryChange() {
  await Promise.all([loadProducts(form.factoryId), loadProductGroups(form.factoryId)]);
  const productIds = new Set(productsByFactory.value.map((p) => p.id));
  for (const row of form.rows) {
    if (row.productId && !productIds.has(row.productId)) row.productId = "";
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
    productGroupId: null,
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
  // 默认优先选"美奇"，列表里没有的话（比如换了环境）就不选，不会白屏选不出来
  const preferred = factories.value.find((f) => f.name === "美奇");
  if (preferred) listFactoryFilter.value = preferred.id;
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

    <!-- 玩具厂/日期筛选，跟入库单列表同一套：玩具厂默认美奇、日期默认当月 -->
    <div class="filter-bar">
      <el-select v-model="listFactoryFilter" clearable filterable placeholder="全部玩具厂" style="width: 180px">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-date-picker v-model="dateFrom" type="date" placeholder="起" value-format="YYYY-MM-DD" style="width: 140px" />
      <span class="filter-sep">至</span>
      <el-date-picker v-model="dateTo" type="date" placeholder="止" value-format="YYYY-MM-DD" style="width: 140px" />
    </div>

    <el-alert v-if="draftAvailable" type="warning" :closable="false" show-icon style="margin-bottom: 12px">
      <template #title>
        有一张没录完的出库草稿（上次意外关闭 / 刷新时自动存下的）
        <el-button link type="primary" @click="restoreDraft">恢复</el-button>
        <el-button link type="danger" @click="discardDraft">丢弃</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="filteredList" stripe size="small" :row-class-name="rowClassName">
      <el-table-column label="出库日期" width="120">
        <template #default="{ row }">{{ (row.returnDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column label="类型" width="105" align="center">
        <template #default="{ row }">
          <el-tag :type="row.kind === 'return' ? 'danger' : 'primary'" size="small" effect="plain">{{ kindLabel(row.kind) }}</el-tag>
          <el-tooltip v-if="duplicateRecordMap.has(row.id)" :content="`疑似重复：${duplicateRecordMap.get(row.id)}`">
            <el-icon class="diff-icon"><WarningFilled /></el-icon>
          </el-tooltip>
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
            :preview-src-list="row.images" hide-on-click-modal
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
      width="min(1100px, 96vw)"
    >
      <!-- 跟入库确认页同一个排版：表单+明细在上面，单据原图在下面居中摆一个固定框——
           两边位置统一了，不用对着不同页面找不同地方看图 -->
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="玩具厂" prop="factoryId">
          <el-select v-model="form.factoryId" filterable style="width: 100%" @change="onFactoryChange">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="出库日期" prop="returnDate">
          <el-date-picker v-model="form.returnDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
        </el-form-item>
        <el-form-item label-width="0">
          <!-- 每一行固定用 grid 分栏，跟表头严格对齐，宽度不够就整体横向滚动，不会乱换行错位。
               表头不管发料还是退货都一样（产品/类型/重量/克重/数量/备注），哪个字段这一行用
               不上就显示"-"，不会因为切换类型而整张表的列忽多忽少 -->
          <el-alert v-if="duplicateGroups.length" type="warning" show-icon :closable="false" class="dup-alert">
            <template #title>这批里有 {{ duplicateGroups.length }} 组疑似重复，对应的行已经标红</template>
            <div v-for="g in duplicateGroups" :key="g.key" class="dup-item">
              {{ g.label }} — 第 {{ g.indexes.map((i) => i + 1).join("、") }} 行
            </div>
          </el-alert>
          <div class="rows-editor">
            <div class="rows-grid rows-grid--header">
              <span class="col-label">操作</span>
              <span class="col-label">类型</span>
              <span class="col-label">货号 / 物料</span>
              <span class="col-label col-label--required">重量(斤)</span>
              <span class="col-label">克重(g)</span>
              <span class="col-label">数量</span>
              <span class="col-label">算出数量</span>
              <span class="col-label">备注</span>
            </div>
            <!-- 退货按货号选（工序，跟入库单一样）；发料是原材料，没有货号，直接打物料名称，
                 下拉候选是这个玩具厂各产品的物料清单（在"产品管理"里维护），选不到就直接打字 -->
            <div
              v-for="(row, idx) in form.rows"
              :key="idx"
              class="rows-grid"
              :class="{ 'rows-grid--duplicate': duplicateRowIndexes.has(idx) }"
            >
              <el-button v-if="dialogMode === 'create'" link type="danger" @click="removeRow(idx)">删除</el-button>
              <span v-else class="muted col-dash">-</span>

              <!-- 这一行是发料还是退货：退货才会从应收账单里扣，所以每行都要看清楚选对——放在
                   最前面，一打开就能先定好类型，再填后面跟着这个类型变化的字段 -->
              <el-select v-model="row.kind" style="width: 100%" :class="{ 'kind-select--return': row.kind === 'return' }">
                <el-option label="发料" value="issue" />
                <el-option label="退货" value="return" />
              </el-select>

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
                <el-option v-for="name in materialOptionsFor()" :key="name" :label="name" :value="name" />
              </el-select>

              <el-input-number v-model="row.weightJin" :min="0" :precision="3" controls-position="right" style="width: 100%" />

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

              <el-input v-model="row.reason" :placeholder="row.kind === 'return' ? '比如：破损/色差' : '选填'" />
            </div>
            <el-button v-if="dialogMode === 'create'" @click="addRow">+ 添加一行</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <!-- 单据原图放在明细下面，居中一个固定框——跟入库确认页的图片位置统一 -->
      <div v-if="form.imageUrl" class="image-panel">
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
.filter-bar {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.filter-sep {
  color: #909399;
  font-size: 13px;
}
.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}
/* 单据原图放在货号明细下面，居中摆一个固定尺寸的框——跟入库确认页的图片位置、
   尺寸统一，不用对着不同页面找不同地方看图 */
.image-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
}

.slip-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
  text-align: center;
}

/* 出库单预览：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互，
   固定尺寸的框 + overflow:hidden 裁掉超出部分，交互事件绑在框上（不是图片本身）——
   图片实际渲染尺寸经常比框小，事件只挂图片上的话空白区域滚轮/拖拽会没反应 */
.slip-frame {
  position: relative;
  width: 640px;
  height: 480px;
  max-width: 100%;
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
  margin-left: 4px;
}

/* 列表里已经保存的记录，如果跟另一条疑似重复，整行标红——不只是录入时的弹窗，
   历史数据本身也要一眼看出来（哪怕当时是强制保存过的） */
:deep(.row-is-duplicate td) {
  background-color: #fef0f0 !important;
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
  /* 操作 / 类型 / 货号或物料 / 重量 / 克重 / 数量 / 算出数量 / 备注——
     不管发料还是退货都是这一套列，用不上的格子显示"-"，不会因为切换类型列忽多忽少 */
  grid-template-columns: 60px 90px 200px 95px 95px 95px 80px 140px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
  min-width: 920px;
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

/* 窄屏（手机）下固定 640px 的图片框放不下，缩小一点、靠 max-width:100% 自适应 */
@media (max-width: 680px) {
  .slip-frame {
    height: 360px;
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
