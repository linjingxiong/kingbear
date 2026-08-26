<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  calculateQuantity,
  hasBigQuantityDiff,
  InboundStatus,
  QuantitySource,
  type ConfirmInboundDto,
  type DuplicateConflictResponse,
  type FactoryListItem,
  type InboundRecord,
  type Product,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { findProductsBySku, listProductsByFactory } from "../../api/product";
import { confirmInbound, getInbound, rotateInboundImage, updateInbound } from "../../api/inbound";

const route = useRoute();
const router = useRouter();
const recordId = route.params.id as string;

const record = ref<InboundRecord | null>(null);
const factories = ref<FactoryListItem[]>([]);
const products = ref<Product[]>([]);
const loading = ref(false);
const submitting = ref(false);
const rotating = ref(false);

// 滚轮缩放 + 拖拽平移
const zoomLevel = ref(1);
const panX = ref(0);
const panY = ref(0);
const isDragging = ref(false);
let dragStartX = 0;
let dragStartY = 0;
let panStartX = 0;
let panStartY = 0;
let dragMoved = false;

function resetZoom() {
  zoomLevel.value = 1;
  panX.value = 0;
  panY.value = 0;
}

function onWheel(e: WheelEvent) {
  const step = e.deltaY < 0 ? 0.2 : -0.2;
  zoomLevel.value = Math.min(4, Math.max(1, zoomLevel.value + step));
  if (zoomLevel.value === 1) {
    panX.value = 0;
    panY.value = 0;
  }
}

function onMouseDown(e: MouseEvent) {
  if (zoomLevel.value <= 1) return;
  if ((e.target as HTMLElement).closest(".image-toolbar")) return;
  isDragging.value = true;
  dragMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  panStartX = panX.value;
  panStartY = panY.value;
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
  panX.value = panStartX + dx;
  panY.value = panStartY + dy;
}

function onMouseUp() {
  isDragging.value = false;
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
}

/** 取消了"点击放大"，只保留：放大状态下点一下（没有拖拽平移）就缩回 1 倍 */
function onImageClick() {
  if (dragMoved) {
    dragMoved = false;
    return;
  }
  if (zoomLevel.value > 1) resetZoom();
}

// 图片本身从不改动，imageUrl 永远不变，不需要缓存穿透那一套
const imageSrc = computed(() => record.value?.imageUrl ?? "");

// 旋转只是改数据库里的一个角度字段（见 inbound.service.ts 的注释），前端拿到新角度直接
// 用 CSS rotate() 显示，没有图片要重新加载，也就没有"闪一下""转错方向"这类问题的存在空间。
async function rotateImage() {
  if (!record.value) return;
  rotating.value = true;
  try {
    record.value = await rotateInboundImage(record.value.id, "right");
    resetZoom();
  } finally {
    rotating.value = false;
  }
}

/** 当前是不是"横过来"的角度（90/270）：是的话展示框的宽高要对调，不然转完会被裁掉一截 */
const isSideways = computed(() => {
  const r = ((record.value?.rotation ?? 0) % 360 + 360) % 360;
  return r === 90 || r === 270;
});

// 展示框固定尺寸（跟下面 CSS 里 .image-frame 保持一致）
const FRAME_WIDTH = "640px";
const FRAME_HEIGHT = "480px";

const imageStyle = computed(() => {
  const rotation = record.value?.rotation ?? 0;
  return {
    maxWidth: isSideways.value ? FRAME_HEIGHT : FRAME_WIDTH,
    maxHeight: isSideways.value ? FRAME_WIDTH : FRAME_HEIGHT,
    transform: `translate(${panX.value}px, ${panY.value}px) rotate(${rotation}deg) scale(${zoomLevel.value})`,
  };
});

const factoryId = ref<string>("");
const inboundDate = ref<string>("");

interface EditableItem {
  productId: string | null;
  sku: string;
  name: string;
  weightJin: number;
  unitWeightG: number;
  qtyDeclared: number | null;
  quantitySource: QuantitySource;
  factoryPrice: number;
  remark?: string;
}

const items = reactive<EditableItem[]>([]);

/**
 * OCR 偶尔会把单据上货号旁边写的"成品/半成品"这类描述词也一起认进货号里，
 * 比如把 "351" 认成 "351成品"，导致跟产品库里存的干净货号对不上、匹配不出名称和工厂价。
 * 这里做个兜底：去掉这些常见后缀词，尽量还原成产品库里真正的货号。
 */
function normalizeSku(raw: string): string {
  return raw.trim().replace(/(成品|半成品)$/, "").trim();
}

function qtyCalculated(item: EditableItem) {
  return calculateQuantity(item.weightJin, item.unitWeightG);
}

/** 不再区分"单据/系统"两个来源，就一个数量，编辑框里填的是多少就是多少 */
function qtyFinal(item: EditableItem) {
  return item.qtyDeclared ?? qtyCalculated(item);
}

function amount(item: EditableItem) {
  return qtyFinal(item) * item.factoryPrice;
}

function hasDiff(item: EditableItem) {
  return item.qtyDeclared != null && item.qtyDeclared !== qtyCalculated(item);
}

// "差多少算太多"（相差超过 1%）这个判断标准放在 @kingbear/shared 里，入库确认页提交前的拦截、
// 入库管理列表、应收账单的提醒用的是同一份逻辑，不会出现好几套标准各判各的
function hasBigDiff(item: EditableItem) {
  return item.qtyDeclared != null && hasBigQuantityDiff(item.qtyDeclared, qtyCalculated(item));
}

const totalAmount = computed(() => items.reduce((sum, i) => sum + amount(i), 0));

async function load() {
  loading.value = true;
  try {
    const [r, factoryList] = await Promise.all([getInbound(recordId), listFactories()]);
    record.value = r;
    factories.value = factoryList;
    factoryId.value = r.factoryId ?? "";
    inboundDate.value = r.inboundDate.slice(0, 10);
    items.splice(
      0,
      items.length,
      ...r.items.map((i) => ({
        productId: i.productId,
        sku: normalizeSku(i.sku),
        name: i.name,
        weightJin: i.weightJin,
        unitWeightG: i.unitWeightG,
        // 识别没识别出数量的话，先拿系统按公式算出来的数量兜底，编辑框里始终有个数可以改
        qtyDeclared: i.qtyDeclared ?? i.qtyCalculated,
        quantitySource: QuantitySource.Declared,
        factoryPrice: i.factoryPrice,
        remark: i.remark,
      })),
    );
    if (factoryId.value) {
      await loadProducts();
      syncItemsFromCatalog();
    } else {
      // 玩具厂没识别出来：拿每一行的货号去全量产品库反查，猜出这单是哪个玩具厂的、
      // 顺便把认得出来的名称也带出来
      await suggestFactoryFromSkus();
    }
  } finally {
    loading.value = false;
  }
}

/** 货号在产品库里全量查唯一命中的话，用它带出玩具厂 + 名称 + 工厂价 */
async function suggestFactoryFromSkus() {
  const skus = [...new Set(items.map((i) => i.sku).filter(Boolean))];
  if (!skus.length) return;

  const results = await Promise.all(skus.map((sku) => findProductsBySku(sku)));
  const uniqueMatchBySku = new Map<string, Product>();
  results.forEach((matches, idx) => {
    if (matches.length === 1) uniqueMatchBySku.set(skus[idx], matches[0]);
  });
  if (!uniqueMatchBySku.size) return;

  for (const item of items) {
    const matched = uniqueMatchBySku.get(item.sku);
    if (!matched) continue;
    item.productId = matched.id;
    item.name = matched.name;
    if (!item.factoryPrice) item.factoryPrice = matched.factoryPrice;
    if (!factoryId.value) factoryId.value = matched.factoryId;
  }

  // 猜出玩具厂之后，把该厂完整产品库拉一遍，让其它没猜中的行也有机会对上
  if (factoryId.value) {
    await loadProducts();
    syncItemsFromCatalog();
  }
}

async function loadProducts() {
  products.value = factoryId.value ? await listProductsByFactory(factoryId.value) : [];
}

async function onFactoryChange() {
  await loadProducts();
  syncItemsFromCatalog();
}

/**
 * 货号下拉框的选项文字用的是产品库里的"货号 · 名称"，但每一行自己的"名称"字段是 OCR 识别出来
 * 的原始文字，两者互不相干——如果货号刚好匹配上产品库里的记录，会出现下拉框显示的名称和
 * 输入框里的名称对不上的情况。这里在拿到产品列表后统一对一遍：货号匹配上了，就把名称、
 * 工厂价（如果当前还没填）都换成产品库里的，跟下拉框显示的保持一致。
 */
function syncItemsFromCatalog() {
  for (const item of items) {
    const matched = products.value.find((p) => p.sku === item.sku);
    if (!matched) continue;
    item.productId = matched.id;
    item.name = matched.name;
    if (!item.factoryPrice) item.factoryPrice = matched.factoryPrice;
  }
}

/** 货号在产品库里已有档案的话，一键带出名称/工厂价 */
function fillFromProduct(item: EditableItem) {
  const matched = products.value.find((p) => p.sku === item.sku);
  if (!matched) {
    item.productId = null;
    ElMessage.warning("该货号在所选玩具厂下暂无产品档案，请手动填写工厂价");
    return;
  }
  item.productId = matched.id;
  item.name = matched.name;
  item.factoryPrice = matched.factoryPrice;
}

function addItem() {
  items.push({
    productId: null,
    sku: "",
    name: "",
    weightJin: 0,
    unitWeightG: 0,
    qtyDeclared: 0,
    quantitySource: QuantitySource.Declared,
    factoryPrice: 0,
  });
}

function removeItem(index: number) {
  items.splice(index, 1);
}

async function handleSubmit() {
  if (!factoryId.value) {
    ElMessage.warning("请先选择玩具厂");
    return;
  }
  if (!items.length) {
    ElMessage.warning("至少需要一行产品明细");
    return;
  }

  // 数量跟按重量算出来的差太多，很可能是录入的时候多敲/少敲了数字——提交前拦一下，
  // 让用户明确确认这就是想要的数，而不是让明显有问题的数据悄悄提交成功
  const bigDiffItems = items.filter(hasBigDiff);
  if (bigDiffItems.length) {
    const detail = bigDiffItems
      .map((i) => `货号 ${i.sku || "(未填)"}：录入 ${i.qtyDeclared} / 按重量计算 ${qtyCalculated(i)}`)
      .join("；");
    try {
      await ElMessageBox.confirm(
        `以下产品的数量跟系统按重量计算出来的差异较大：${detail}。确定要按录入的数量提交吗？`,
        "数量差异较大",
        { confirmButtonText: "确认按此提交", cancelButtonText: "返回检查", type: "warning" },
      );
    } catch {
      return; // 用户选择返回检查，不提交
    }
  }

  const dto: ConfirmInboundDto = {
    factoryId: factoryId.value,
    inboundDate: inboundDate.value,
    items: items.map((i) => ({
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      weightJin: i.weightJin,
      unitWeightG: i.unitWeightG,
      qtyDeclared: i.qtyDeclared,
      quantitySource: i.quantitySource,
      factoryPrice: i.factoryPrice,
      remark: i.remark,
    })),
  };

  submitting.value = true;
  try {
    const isUpdate = record.value?.status === InboundStatus.Completed;
    const submit = () => (isUpdate ? updateInbound(recordId, dto) : confirmInbound(recordId, dto));

    try {
      await submit();
    } catch (err) {
      const data = (err as { response?: { data?: DuplicateConflictResponse } }).response?.data;
      if (data?.duplicateType !== "item") throw err;
      // 疑似重复录入，人工确认过之后带 force 再提交一次，不再拦；点"返回检查"就到此为止
      try {
        await ElMessageBox.confirm(data.message, "疑似重复录入", {
          confirmButtonText: "确认按此提交",
          cancelButtonText: "返回检查",
          type: "warning",
        });
      } catch {
        return;
      }
      dto.force = true;
      await submit();
    }

    ElMessage.success(isUpdate ? "已保存修改，账单会自动同步最新金额" : "入库单已确认完成");
    router.push("/inbound");
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="confirm-page">
    <div class="confirm-layout">
      <el-card header="OCR 识别结果 · 人工确认">
          <el-form label-width="90px">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="玩具厂">
                  <el-select v-model="factoryId" placeholder="请选择玩具厂" style="width: 100%" @change="onFactoryChange">
                    <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="入库日期">
                  <el-date-picker v-model="inboundDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>

          <div class="items-toolbar">
            <span>产品明细</span>
            <el-button size="small" @click="addItem">+ 添加一行</el-button>
          </div>

          <el-table :data="items" border size="small">
            <el-table-column label="货号" width="180">
              <template #default="{ row }">
                <el-select
                  v-model="row.sku"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="选择或输入货号"
                  size="small"
                  style="width: 100%"
                  @change="fillFromProduct(row)"
                >
                  <el-option v-for="p in products" :key="p.id" :label="p.sku" :value="p.sku">
                    <span>{{ p.sku }} · {{ p.name }}</span>
                  </el-option>
                </el-select>
              </template>
            </el-table-column>
            <el-table-column label="名称" width="140">
              <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
            </el-table-column>
            <el-table-column label="重量(斤)" width="140">
              <template #default="{ row }">
                <el-input-number v-model="row.weightJin" :min="0" :precision="3" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="单个克重(g)" width="150">
              <template #default="{ row }">
                <el-input-number v-model="row.unitWeightG" :min="0.1" :precision="3" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="数量" width="150">
              <template #default="{ row }">
                <div class="qty-cell">
                  <el-input-number v-model="row.qtyDeclared" :min="0" size="small" style="width: 100%" />
                  <el-tag v-if="hasDiff(row)" :type="hasBigDiff(row) ? 'danger' : 'warning'" size="small">
                    与系统计算（{{ qtyCalculated(row) }}）不一致
                  </el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="工厂价" width="130">
              <template #default="{ row }">
                <el-input-number v-model="row.factoryPrice" :min="0" :precision="4" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="金额" width="90" align="right">
              <template #default="{ row }">¥{{ amount(row).toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="备注" min-width="140">
              <template #default="{ row }"><el-input v-model="row.remark" size="small" /></template>
            </el-table-column>
            <el-table-column width="60">
              <template #default="{ $index }">
                <el-button link type="danger" @click="removeItem($index)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>

          <div class="total-line">合计加工金额：<b>¥{{ totalAmount.toFixed(2) }}</b></div>

          <div class="submit-line">
            <el-button type="primary" :loading="submitting" @click="handleSubmit">
              {{ record?.status === "completed" ? "保存修改" : "确认入库" }}
            </el-button>
          </div>
      </el-card>

      <!-- 手工录入的记录没有单据图片（imageUrl 是空字符串），这块整个不显示 -->
      <div v-if="record && record.imageUrl" class="image-panel">
        <div
          class="image-frame"
          :class="{
            'image-frame--zoomed': zoomLevel > 1,
            'image-frame--dragging': isDragging,
          }"
          @click="onImageClick"
          @wheel.prevent="onWheel"
          @mousedown="onMouseDown"
        >
          <div class="image-toolbar">
            <el-button size="small" :loading="rotating" @click.stop="rotateImage">
              <el-icon><RefreshRight /></el-icon>
              <span>向右旋转</span>
            </el-button>
          </div>
          <img v-loading="rotating" :src="imageSrc" class="inbound-image" :style="imageStyle" draggable="false" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 撑满可用宽度，靠 justify-content 把里面那个固定尺寸的 image-frame 水平居中，
   不依赖外层 flex 列的 align-self（避免跟外层拉伸行为打架） */
.image-panel {
  display: flex;
  justify-content: center;
}

/* 固定尺寸的展示框（不再是贴合图片大小的 inline-block）。固定下来是因为图片能横着转 90°/270°，
   贴合图片自身尺寸的容器没法跟着转，会导致转完的内容被裁掉一截；固定框 + flex 居中 + 下面
   imageStyle 按角度对调 max-width/max-height，转完的内容永远居中摆在这个框正中间。
   overflow:hidden 顺带也用来裁掉滚轮放大/拖拽平移后超出这个框的部分 */
/* 交互事件（滚轮/拖拽/点击）绑在这个框上而不是图片本身——图片实际渲染的尺寸经常比这个
   固定框小（比如竖版图片两边会有空白），事件只挂在图片上的话，鼠标停在空白区域滚轮/拖拽
   会完全没反应，之前就是栽在这上面 */
.image-frame {
  position: relative;
  width: 640px;
  height: 480px;
  max-width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image-frame--zoomed {
  cursor: grab;
}

.image-frame--dragging {
  cursor: grabbing;
}

/* 小工具条悬浮在图片右上角，半透明底，不占页面布局空间 */
.image-toolbar {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 1;
  display: flex;
  gap: 6px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 6px;
  backdrop-filter: blur(2px);
}

.image-toolbar :deep(.el-button) {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
  background: transparent;
}

.image-toolbar :deep(.el-button:hover) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

/* max-width/max-height 由 imageStyle 动态给（按旋转角度对调宽高，见脚本注释），这里只放
   静态样式。旋转角度（rotate）不加过渡动画——之前在这上面栽过跟头，转的瞬间必须"直接生效"，
   不能有任何中间画面；max-width/max-height 的过渡是纯展开/收起动画，跟这个教训无关，可以留着。
   鼠标事件都在 .image-frame 上处理，这里 pointer-events:none 让图片本身不挡事件（尤其是
   放大后图片可能比框还大，不用担心它盖住框边缘导致事件送不到 .image-frame） */
.inbound-image {
  display: block;
  width: auto;
  height: auto;
  user-select: none;
  pointer-events: none;
  transition: max-width 0.2s, max-height 0.2s;
}

.items-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 16px 0 8px;
  font-weight: 600;
}

.qty-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.total-line {
  text-align: right;
  margin-top: 12px;
  font-size: 15px;
}

.submit-line {
  text-align: right;
  margin-top: 12px;
}
</style>
