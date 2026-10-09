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
// 出库单预览图：滚轮缩放 + 拖拽平移，跟入库确认页/成品回收单据图片同一套交互。
// 发料单导入支持一次选好几张图（同一张单拍了好几页），每张图各自独立缩放/平移，
// 所以不是只建一份状态，是按图片在数组里的下标各建一份、缓存起来（useImageZoomPan
// 内部只用了 ref/computed，不依赖 setup() 的调用时机，这样按需创建是安全的）
const slipZoomStates = new Map<number, ReturnType<typeof useImageZoomPan>>();
function slipZoomStateFor(idx: number) {
  if (!slipZoomStates.has(idx)) slipZoomStates.set(idx, useImageZoomPan());
  return slipZoomStates.get(idx)!;
}
function resetSlipZoomStates() {
  for (const s of slipZoomStates.values()) s.reset();
  slipZoomStates.clear();
}

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
  /** 这一行是从 form.imageUrls 里第几张图识别出来的；手动加的行（没有对应图片）是 null。
   * 只用来在界面上把"这张图识别出来的行"跟这张图摆在一起显示，提交时也决定这一行该挂哪张图 */
  sourceImageIdx: number | null;
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
    sourceImageIdx: null,
  };
}

// form 挪到这几个查重/分组 computed 前面声明，这几个 computed 都要读 form.rows/form.imageUrls
const form = reactive({
  factoryId: "",
  returnDate: "",
  remark: "",
  // 发料单可能一张单拍好几张照片才拍全，支持导入时多选；退货单还是一次一张
  imageUrls: [] as string[],
  rows: [] as RowItem[],
});

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
  /** 每个命中行"第几张图第几行/手动新增第几行"的定位文案，跟 indexes 一一对应——"校对
   * 工作台"一次只显示一张图，光甩一个全局行号（第 4 行）根本不知道第 4 行在哪张图里，
   * 这里换算成跟界面实际分组、顺序对得上的说法，一眼能找到 */
  locations: string[];
}
// 把 form.rows 的下标换算成"第几张图第几行"（手动新增的行换算成"手动新增第几行"）
function rowLocationLabel(idx: number): string {
  const row = form.rows[idx];
  const sameSource = form.rows.filter((r) => r.sourceImageIdx === row.sourceImageIdx);
  const pos = sameSource.indexOf(row) + 1;
  return row.sourceImageIdx != null ? `第${row.sourceImageIdx + 1}张图第${pos}行` : `手动新增第${pos}行`;
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
    const g = groups.get(key) ?? { key, label, indexes: [], locations: [] };
    g.indexes.push(idx);
    g.locations.push(rowLocationLabel(idx));
    groups.set(key, g);
  });
  return [...groups.values()].filter((g) => g.indexes.length > 1);
});
const duplicateRowIndexes = computed(() => new Set(duplicateGroups.value.flatMap((g) => g.indexes)));

/**
 * 识别结果不能混在一起摊成一张大表——按"这一行是哪张图识别出来的"重新分组，每组自己的图片
 * 摆在自己那组行的上面，一组一组看，不用在一堆行里猜哪几行是哪张图来的。手动加的行（没有
 * 图）归到最后"手动新增"这一组，没有手动行的时候这一组不出现。
 */
interface RenderRow {
  row: RowItem;
  /** 在 form.rows 里的下标，删除/标红都按这个来，跟渲染顺序（按组）分开算 */
  flatIndex: number;
}
interface RenderGroup {
  imageIdx: number | null;
  imageUrl: string | null;
  rows: RenderRow[];
}
const renderGroups = computed<RenderGroup[]>(() => {
  const groups: RenderGroup[] = form.imageUrls.map((url, i) => ({ imageIdx: i, imageUrl: url, rows: [] }));
  const manual: RenderGroup = { imageIdx: null, imageUrl: null, rows: [] };
  form.rows.forEach((row, flatIndex) => {
    const g = row.sourceImageIdx != null ? groups[row.sourceImageIdx] : undefined;
    (g ?? manual).rows.push({ row, flatIndex });
  });
  return manual.rows.length ? [...groups, manual] : groups;
});

/**
 * 导了好几张图的时候，先给一张"校对工作台"总览——每张图一行，标好校对状态，点"校对"
 * 进这张图的明细编辑区，保存一次就把这张图标成"已校对"、自动跳回总览，不用自己记哪张弄完了。
 * 只有一张图（或手动录入、编辑）还是走原来"一次性全部保存"那条路，不用为了这个场景多绕一圈。
 * 只在真正导入多张图的时候才打开（importIssueFiles 里设），resetForm 时关掉。
 */
const isMultiImageBatch = ref(false);
/** null = 显示总览列表；有值就是正在校对哪一组（取 groupKey 的返回值） */
const activeGroupKey = ref<string | null>(null);
/** 点过"校对完成并保存"的组记在这，总览列表里标"已校对"——图片下标当 key 不够用，手动组
 * 没有下标，统一换成字符串 */
const completedGroupKeys = ref<Set<string>>(new Set());
function groupKey(g: RenderGroup): string {
  return g.imageIdx != null ? String(g.imageIdx) : "manual";
}
// 总览列表：每张图各一行；"手动新增"这一行只有真的已经有手动行了才出现，不会凭空摆一个
// 空的"手动"条目在那——之前固定摆一条空的，容易让人误点进去、又手滑点一下"+ 添加一行"，
// 多出一条自己都不知道是什么的空行
const listGroups = computed<RenderGroup[]>(() => {
  if (!isMultiImageBatch.value) return [];
  return renderGroups.value;
});
const completedCount = computed(() => listGroups.value.filter((g) => completedGroupKeys.value.has(groupKey(g))).length);
const activeGroup = computed<RenderGroup | undefined>(() =>
  activeGroupKey.value == null ? undefined : listGroups.value.find((g) => groupKey(g) === activeGroupKey.value),
);
// 不是多图批次：货号明细照常显示 renderGroups 里的全部组（通常也就一组）；
// 是多图批次：总览列表时这里不显示，点进某一组之后只显示这一组
const groupsToShow = computed(() => (isMultiImageBatch.value ? (activeGroup.value ? [activeGroup.value] : []) : renderGroups.value));

function openGroupDetail(key: string) {
  activeGroupKey.value = key;
}
function backToList() {
  activeGroupKey.value = null;
}
// 总览列表默认不显示"手动"条目，真要手动补一行（比如这几张图漏拍了一行）就点这个，
// 加一行空的、直接带你进去填，不用先去找哪里能加
function addManualRowAndOpen() {
  addRow(null);
  activeGroupKey.value = "manual";
}

/** 保存一组（一张图 + 它识别出来的那几行）。组里只要有没填完整的行，这些行就不提交、也不
 * 摘掉，留在这一组里改完再点一次——不像之前的写法，之前只要组里有一行填好了，就会把"没填好
 * 的那些行"也一并悄悄从表单里删掉，等于没保存就把数据丢了，这里改正过来了 */
async function submitGroupRows(group: RenderGroup): Promise<boolean> {
  const validRows = group.rows.filter((r) => rowIsValid(r.row));
  const invalidCount = group.rows.length - validRows.length;
  if (group.rows.length > 0 && !validRows.length) {
    ElMessage.warning("请至少填好一行：退货要选货号+填重量(斤)，发料要填物料名称+填重量(斤)");
    return false;
  }
  if (validRows.length) {
    await Promise.all(validRows.map((r) => ensureMaterialInGroup(r.row)));
    for (const { row } of validRows) {
      // 这一行只带它自己来源的那张图，不是这批导入的图全部塞给每一行
      const images = row.sourceImageIdx != null ? [form.imageUrls[row.sourceImageIdx]].filter(Boolean) : [];
      const dto: CreateInboundReturnDto = {
        kind: row.kind,
        factoryId: form.factoryId,
        ...buildRowFields(row),
        returnDate: form.returnDate,
        reason: row.reason,
        remark: form.remark,
        images,
      };
      await submitWithDuplicateConfirm(dto, createInboundReturn);
      // 这一行一提交成功就立刻从表单里摘掉，不等整组都提交完再一起摘——不然万一组里
      // 后面某一行提交时弹出"疑似重复"被取消、抛出异常，前面已经真正存进数据库的行
      // 会因为还留在表单里，下次重试这一组又被重复提交一遍。按对象本身摘不按下标，
      // 摘掉前面的不会打乱后面还没提交的行在数组里的位置
      form.rows = form.rows.filter((r) => r !== row);
    }
  }
  if (invalidCount > 0) {
    ElMessage.warning(`这一组还有 ${invalidCount} 行没填完整，留在这一组里没保存，改完再点一次`);
    return false;
  }
  return true;
}

async function submitCurrentGroup() {
  await formRef.value?.validate();
  const group = activeGroup.value;
  if (!group) return;
  const ok = await submitGroupRows(group);
  if (!ok) return;
  completedGroupKeys.value.add(groupKey(group));
  load();
  activeGroupKey.value = null;
  const remaining = listGroups.value.length - completedCount.value;
  ElMessage.success(remaining === 0 ? "全部校对完成，可以点下面「关闭」了" : `已保存，返回列表（还剩 ${remaining} 张未校对）`);
}

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
    form.imageUrls.length ||
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
      // 改版之前存下的草稿是单张图（imageUrl 字符串），兼容一下，不然老草稿的图会丢
      imageUrls: Array.isArray(d.imageUrls) ? d.imageUrls : d.imageUrl ? [d.imageUrl] : [],
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
// 图片换了（新建/识别/编辑/恢复草稿）就把缩放平移状态清掉，不然带着上一张图的缩放状态显示新图；
// 新导入一批图，也把"当前第几组"归零，不要停在上一批导入时的进度上
watch(
  () => form.imageUrls,
  () => {
    resetSlipZoomStates();
    activeGroupKey.value = null;
  },
);
watch(dialogVisible, (open) => {
  if (!open) checkDraft();
});

function resetForm() {
  Object.assign(form, {
    factoryId: "",
    returnDate: "",
    remark: "",
    imageUrls: [],
    rows: [],
  });
  lastIssueProductGroupId.value = "";
  isMultiImageBatch.value = false;
  activeGroupKey.value = null;
  completedGroupKeys.value = new Set();
}
// sourceImageIdx 不传就是手动新增（没有对应的图）；传了就加到那张图的分组里，
// 比如识别完觉得某张图还漏了一行，在那张图自己的"+ 添加一行"里补
function addRow(sourceImageIdx: number | null = null) {
  // 新增的行直接带上这批最近选的产品，省得同一个产品每行都要重选一遍
  form.rows.push({ ...blankRow(), productGroupId: lastIssueProductGroupId.value, sourceImageIdx });
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
  // 编辑永远走"一次性保存"（调用 updateInboundReturn，不是新建）那条路，不能停在上一次
  // 多图导入留下的"校对工作台"状态上——那条路是硬编码调 createInboundReturn 建新记录的
  isMultiImageBatch.value = false;
  activeGroupKey.value = null;
  completedGroupKeys.value = new Set();
  await Promise.all([loadProducts(row.factoryId), loadProductGroups(row.factoryId)]);
  Object.assign(form, {
    factoryId: row.factoryId,
    returnDate: (row.returnDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
    imageUrls: row.images ?? [],
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
        // 编辑时只有一行，有图就归到第一张图那组，方便对着图核对，没图就是手动那组
        sourceImageIdx: row.images?.length ? 0 : null,
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
    form.imageUrls = [r.imageUrl];

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
            sourceImageIdx: 0,
          };
        })
      : [{ ...blankRow("return"), sourceImageIdx: 0 }];

    dialogVisible.value = true;
    ElMessage.success("识别完成，请核对后保存");
  } finally {
    uploading.value = false;
  }
}

// 拍照识别·发料：发的是原材料，识别模板跟退货完全不一样（物料名称+重量，没有货号/克重），
// 走单独的接口，识别到的行直接是"发料"，不用猜类型
const issueFileInputRef = ref<HTMLInputElement>();

function triggerIssueFilePicker() {
  issueFileInputRef.value?.click();
}

// 原生 <input type="file" multiple> 选完文件一次性拿到整个 FileList，自己控制挨个识别、
// 把结果合并进同一张表——el-upload 组件选多个文件时是每个文件各自独立触发一次上传回调，
// 协调不了"这是同一批、要合在一起"，所以这个按钮不用 el-upload，换成这个
async function onIssueFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = input.files ? Array.from(input.files) : [];
  input.value = ""; // 清空，不然连续两次选同一批文件，第二次不会触发 change
  if (files.length) await importIssueFiles(files);
}

// 拍照识别·发料：一张出库单纸写得多，经常要拍好几张才拍全，支持一次选多张图——逐张识别，
// 识别出来的行全部合并进同一张表；玩具厂/日期只认第一张识别出来的（几张图本来就是同一张单）
async function importIssueFiles(files: File[]) {
  uploading.value = true;
  try {
    dialogMode.value = "create";
    editingId.value = null;
    resetForm();

    const imageUrls: string[] = [];
    const rows: RowItem[] = [];
    let headerFilled = false;
    for (const [idx, file] of files.entries()) {
      const r = await recognizeOutboundIssue(file);
      imageUrls.push(r.imageUrl);
      if (!headerFilled) {
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
        headerFilled = true;
      }
      // 打上这一行是第几张图识别出来的，界面上才能把这张图跟它识别出来的行摆在一起，
      // 不是所有图识别出来的行混成一张大表
      for (const it of r.items) {
        rows.push({ ...blankRow("issue"), materialName: it.materialName, weightJin: it.weightJin, sourceImageIdx: idx });
      }
    }

    form.imageUrls = imageUrls;
    form.rows = rows.length ? rows : [{ ...blankRow("issue"), sourceImageIdx: 0 }];
    // 选了不止一张图才按"一组一组提交"来；就选了一张图，跟原来一样一次性保存就行
    isMultiImageBatch.value = files.length > 1;

    dialogVisible.value = true;
    ElMessage.success(
      files.length > 1
        ? `${files.length} 张图识别完成，共 ${rows.length} 行，可以逐组提交，不用一次填完`
        : "识别完成，请核对后保存",
    );
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
      // 这一行是哪张图识别出来的，就只带那一张图，不是这批导入的图全塞给每一行——
      // 不然两张图导入出 10 行，每一行都背着这两张图，核对的时候根本分不清是哪张
      const images = row.sourceImageIdx != null ? [form.imageUrls[row.sourceImageIdx]].filter(Boolean) : [];
      const dto: CreateInboundReturnDto = {
        kind: row.kind,
        factoryId: form.factoryId,
        ...buildRowFields(row),
        returnDate: form.returnDate,
        reason: row.reason,
        remark: form.remark,
        images,
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
      <!-- 发料单一张纸经常要拍好几张照片才拍全，用原生 input 支持一次多选，选完的几张
           图挨个识别、结果合并进同一张单（不用 el-upload——它选多个文件是各自独立触发，
           协调不了合并逻辑，见 importIssueFiles 的注释） -->
      <input ref="issueFileInputRef" type="file" accept="image/*" multiple class="hidden-file-input" @change="onIssueFilesSelected" />
      <el-button :loading="uploading" @click="triggerIssueFilePicker">
        <el-icon><Plus /></el-icon>
        导入发料单图片（可多选）
      </el-button>
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
          <!-- 识别结果不能混在一起摊成一张大表：按"这一行是哪张图识别出来的"分组，一组一组摆，
               每组自己的图片放在自己那组明细的上面，对着这一张图核对这几行，不用在一堆行里
               翻来翻去猜是哪张图来的。表头不管发料还是退货都一样（类型/产品/货号·物料/重量/
               克重/数量/操作），哪个字段这一行用不上就显示"-" -->
          <el-alert v-if="duplicateGroups.length" type="warning" show-icon :closable="false" class="dup-alert">
            <template #title>这批里有 {{ duplicateGroups.length }} 组疑似重复，对应的行已经标红</template>
            <div v-for="g in duplicateGroups" :key="g.key" class="dup-item">{{ g.label }} — {{ g.locations.join("、") }}</div>
          </el-alert>

          <!-- 导了好几张图的时候先给一张"校对工作台"总览：每张图一行，标好校对状态，点
               "校对"进这张图的明细编辑区，只有一组（手动录入/单张图/编辑）就跳过总览，
               照常全部显示，走原来"一次性保存"那个按钮 -->
          <template v-if="isMultiImageBatch && !activeGroup">
            <div class="review-hint">多张图导入，按图校对：点"校对"看这张图识别出来的物料，改完保存会自动标这张图校对完成</div>
            <el-table :data="listGroups" size="small" border>
              <el-table-column label="图片" width="76">
                <template #default="{ row: g }">
                  <el-image
                    v-if="g.imageUrl"
                    :src="g.imageUrl"
                    :preview-src-list="[g.imageUrl]"
                    hide-on-click-modal
                    preview-teleported
                    fit="cover"
                    class="thumb"
                  />
                  <span v-else class="muted">手动</span>
                </template>
              </el-table-column>
              <el-table-column label="来源">
                <template #default="{ row: g }">{{ g.imageIdx != null ? `第 ${g.imageIdx + 1} 张` : "手动新增 / 补录" }}</template>
              </el-table-column>
              <el-table-column label="待处理行数" width="110" align="center">
                <template #default="{ row: g }">{{ g.rows.length }}</template>
              </el-table-column>
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row: g }">
                  <el-tag v-if="completedGroupKeys.has(groupKey(g))" type="success">已校对</el-tag>
                  <el-tag v-else type="info">未校对</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="center">
                <template #default="{ row: g }">
                  <el-button link type="primary" @click="openGroupDetail(groupKey(g))">校对</el-button>
                </template>
              </el-table-column>
            </el-table>
            <!-- 手动条目不预先摆出来，免得被当成一条"莫名其妙的待办"误点进去；真要补一行
                 （比如这几张图本来就漏拍了一行），点这个再加，直接带进去填 -->
            <el-button link type="primary" class="add-manual-link" @click="addManualRowAndOpen">+ 手动新增一行（没有对应图片）</el-button>
          </template>
          <div v-for="g in groupsToShow" :key="g.imageIdx ?? 'manual'" class="image-rows-group">
            <div v-if="g.imageUrl" class="image-panel-item">
              <div
                class="slip-frame"
                :class="{
                  'slip-frame--zoomed': slipZoomStateFor(g.imageIdx!).zoomLevel.value > 1,
                  'slip-frame--dragging': slipZoomStateFor(g.imageIdx!).isDragging.value,
                }"
                @click="slipZoomStateFor(g.imageIdx!).onClick"
                @wheel.prevent="slipZoomStateFor(g.imageIdx!).onWheel"
                @mousedown="slipZoomStateFor(g.imageIdx!).onMouseDown"
              >
                <img :src="g.imageUrl" class="slip-preview-img" :style="slipZoomStateFor(g.imageIdx!).style.value" draggable="false" />
              </div>
              <div class="slip-hint">
                {{ form.imageUrls.length > 1 ? `第 ${g.imageIdx! + 1} 张 · ` : "" }}滚轮缩放、拖拽平移，对着原图核对下面这几行
              </div>
            </div>
            <div v-else-if="renderGroups.length > 1" class="manual-group-label">手动新增（没有对应图片）</div>

            <!-- 退货按货号选（工序，跟入库单一样）；发料是原材料，没有货号，先选这批料是哪个
                 产品用的（选填），物料名称就能从这个产品的物料清单里下拉选，选不到就直接打字，
                 保存时顺手记进这个产品的物料清单，下次就有了 -->
            <div class="rows-editor">
              <div class="rows-grid rows-grid--header">
                <span class="col-label">类型</span>
                <span class="col-label">产品</span>
                <span class="col-label">货号 / 物料</span>
                <span class="col-label col-label--required">重量(斤)</span>
                <span class="col-label">克重(g)</span>
                <span class="col-label">数量</span>
                <span class="col-label">操作</span>
              </div>
              <div
                v-for="r in g.rows"
                :key="r.flatIndex"
                class="rows-grid"
                :class="{ 'rows-grid--duplicate': duplicateRowIndexes.has(r.flatIndex) }"
              >
                <!-- 这一行是发料还是退货：退货才会从应收账单里扣，所以每行都要看清楚选对——放在
                     最前面，一打开就能先定好类型，再填后面跟着这个类型变化的字段 -->
                <el-select
                  v-model="r.row.kind"
                  style="width: 100%"
                  :class="{ 'kind-select--return': r.row.kind === 'return' }"
                >
                  <el-option label="发料" value="issue" />
                  <el-option label="退货" value="return" />
                </el-select>

                <el-select
                  v-if="r.row.kind === 'issue'"
                  v-model="r.row.productGroupId"
                  filterable
                  clearable
                  :disabled="!form.factoryId"
                  placeholder="产品（选填）"
                  style="width: 100%"
                  popper-class="tag-cloud-dropdown"
                  @change="onRowProductGroupChange(r.row)"
                >
                  <el-option v-for="pg in productGroups" :key="pg.id" :label="pg.name" :value="pg.id" />
                </el-select>
                <span v-else class="muted col-dash">-</span>

                <el-select
                  v-if="r.row.kind === 'return'"
                  v-model="r.row.productId"
                  filterable
                  :disabled="!form.factoryId"
                  :placeholder="r.row.ocrName ? `识别为：${r.row.ocrName}` : '选择货号'"
                  style="width: 100%"
                >
                  <el-option v-for="p in productsByFactory" :key="p.id" :label="`${p.sku} · ${p.name}`" :value="p.id" />
                </el-select>
                <el-select
                  v-else
                  v-model="r.row.materialName"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="物料名称"
                  style="width: 100%"
                  popper-class="tag-cloud-dropdown"
                >
                  <el-option v-for="name in materialOptionsFor(r.row)" :key="name" :label="name" :value="name" />
                </el-select>

                <el-input-number v-model="r.row.weightJin" :min="0" :precision="3" :controls="false" style="width: 100%" />

                <el-input-number
                  v-if="r.row.kind === 'return'"
                  v-model="r.row.unitWeightG"
                  :min="0"
                  :precision="3"
                  controls-position="right"
                  style="width: 100%"
                />
                <span v-else class="muted col-dash">-</span>

                <!-- 数量跟"算出数量"（重量÷克重换算出来的）不一致，不单独占一列，在这个输入框
                     旁边放个提醒图标就够了——鼠标停上去能看到算出来的数量是多少 -->
                <div v-if="r.row.kind === 'return'" class="qty-cell">
                  <el-input-number v-model="r.row.qtyDeclared" :min="0" :controls="false" style="width: 100%" />
                  <el-tooltip v-if="hasDiff(r.row)" :content="`跟按重量算出来的数量（${qtyCalculated(r.row)}）不一致`">
                    <el-icon class="diff-icon" :class="{ 'diff-icon--big': hasBigDiff(r.row) }"><WarningFilled /></el-icon>
                  </el-tooltip>
                </div>
                <span v-else class="muted col-dash">-</span>

                <el-button v-if="dialogMode === 'create'" link type="danger" @click="removeRow(r.flatIndex)">删除</el-button>
                <span v-else class="muted col-dash">-</span>
              </div>
              <el-button v-if="dialogMode === 'create'" @click="addRow(g.imageIdx)">+ 添加一行</el-button>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span v-if="isMultiImageBatch" class="progress-hint"> 已校对 {{ completedCount }} / {{ listGroups.length }} 张 </span>
        <el-button @click="dialogVisible = false">{{ isMultiImageBatch && !activeGroup ? "关闭" : "取消" }}</el-button>
        <el-button v-if="isMultiImageBatch && activeGroup" @click="backToList">返回列表</el-button>
        <el-button v-if="isMultiImageBatch && activeGroup" type="primary" @click="submitCurrentGroup">校对完成并保存</el-button>
        <el-button v-if="!isMultiImageBatch" type="primary" @click="handleSubmit">保存</el-button>
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
.hidden-file-input {
  display: none;
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
.progress-hint {
  margin-right: auto;
  color: #909399;
  font-size: 13px;
}
.review-hint {
  margin-bottom: 10px;
  color: #909399;
  font-size: 13px;
}
.add-manual-link {
  margin-top: 10px;
}
.thumb {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  cursor: zoom-in;
  vertical-align: middle;
}
/* 一组 = 一张图 + 这张图识别出来的那几行，图摆在自己这组明细的上面，组与组之间拉开
   间距、加条分隔线，一眼就能看出这几行是跟着哪张图来的，不会跟别的图的行混在一起 */
.image-rows-group {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px dashed #e4e7ed;
}

.image-rows-group:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.image-panel-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 12px;
}

.manual-group-label {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
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
  /* 类型 / 产品 / 货号或物料 / 重量 / 克重 / 数量 / 操作——数量跟按重量算出来的数量
     不一致时，在数量这格里提醒（见 .qty-cell），不单独占一列 */
  grid-template-columns: 90px 130px 180px 95px 95px 110px 60px;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
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

.qty-cell {
  display: flex;
  align-items: center;
  gap: 4px;
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
