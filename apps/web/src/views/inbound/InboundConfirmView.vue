<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  InboundStatus,
  QuantitySource,
  type ConfirmInboundDto,
  type FactoryListItem,
  type InboundRecord,
  type Product,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { listProductsByFactory } from "../../api/product";
import { confirmInbound, getInbound, updateInbound } from "../../api/inbound";

const route = useRoute();
const router = useRouter();
const recordId = route.params.id as string;

const record = ref<InboundRecord | null>(null);
const factories = ref<FactoryListItem[]>([]);
const products = ref<Product[]>([]);
const loading = ref(false);
const submitting = ref(false);
const imageExpanded = ref(false);

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

const statusSteps = [
  { status: InboundStatus.Processing, label: "识别中" },
  { status: InboundStatus.PendingConfirm, label: "待确认" },
  { status: InboundStatus.Completed, label: "已完成" },
];
const activeStep = computed(() =>
  statusSteps.findIndex((s) => s.status === record.value?.status),
);

function qtyCalculated(item: EditableItem) {
  if (!item.unitWeightG) return 0;
  return Math.round((item.weightJin * 500) / item.unitWeightG);
}

function qtyFinal(item: EditableItem) {
  return item.quantitySource === QuantitySource.Declared
    ? item.qtyDeclared ?? qtyCalculated(item)
    : qtyCalculated(item);
}

function amount(item: EditableItem) {
  return qtyFinal(item) * item.factoryPrice;
}

function hasDiff(item: EditableItem) {
  return item.qtyDeclared != null && item.qtyDeclared !== qtyCalculated(item);
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
        sku: i.sku,
        name: i.name,
        weightJin: i.weightJin,
        unitWeightG: i.unitWeightG,
        qtyDeclared: i.qtyDeclared,
        quantitySource: i.quantitySource,
        factoryPrice: i.factoryPrice,
        remark: i.remark,
      })),
    );
    if (factoryId.value) await loadProducts();
  } finally {
    loading.value = false;
  }
}

async function loadProducts() {
  products.value = factoryId.value ? await listProductsByFactory(factoryId.value) : [];
}

function onFactoryChange() {
  loadProducts();
}

/** 货号在产品库里已有档案的话，一键带出名称/工厂价 */
function fillFromProduct(item: EditableItem) {
  const matched = products.value.find((p) => p.sku === item.sku);
  if (!matched) {
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
    qtyDeclared: null,
    quantitySource: QuantitySource.Calculated,
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
    if (record.value?.status === InboundStatus.Completed) {
      await updateInbound(recordId, dto);
      ElMessage.success("已保存修改，账单会自动同步最新金额");
    } else {
      await confirmInbound(recordId, dto);
      ElMessage.success("入库单已确认完成");
    }
    router.push("/inbound");
  } finally {
    submitting.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="confirm-page">
    <el-steps v-if="record" :active="activeStep" finish-status="success" simple style="margin-bottom: 16px">
      <el-step v-for="s in statusSteps" :key="s.status" :title="s.label" />
    </el-steps>

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
            <el-table-column label="货号" width="130">
              <template #default="{ row }">
                <el-input v-model="row.sku" size="small" @blur="fillFromProduct(row)" />
              </template>
            </el-table-column>
            <el-table-column label="名称" width="140">
              <template #default="{ row }"><el-input v-model="row.name" size="small" /></template>
            </el-table-column>
            <el-table-column label="重量(斤)" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.weightJin" :min="0" :precision="2" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="单个克重(g)" width="110">
              <template #default="{ row }">
                <el-input-number v-model="row.unitWeightG" :min="0.1" :precision="1" size="small" style="width: 100%" />
              </template>
            </el-table-column>
            <el-table-column label="数量" width="200">
              <template #default="{ row }">
                <div class="qty-cell">
                  <el-radio-group v-model="row.quantitySource" size="small">
                    <el-radio :value="QuantitySource.Declared" :disabled="row.qtyDeclared == null">
                      单据 {{ row.qtyDeclared ?? "-" }}
                    </el-radio>
                    <el-radio :value="QuantitySource.Calculated">系统 {{ qtyCalculated(row) }}</el-radio>
                  </el-radio-group>
                  <el-tag v-if="hasDiff(row)" type="warning" size="small">数量存在差异</el-tag>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="工厂价" width="100">
              <template #default="{ row }">
                <el-input-number v-model="row.factoryPrice" :min="0" :precision="2" size="small" style="width: 100%" />
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

      <el-card class="image-card">
        <template #header>
          <span>入库单图片</span>
          <span class="image-hint">（点击图片可放大/缩小，不会挡住表单）</span>
        </template>
        <el-image
          v-if="record"
          :src="record.imageUrl"
          fit="contain"
          class="inbound-image"
          :class="{ 'inbound-image--expanded': imageExpanded }"
          @click="imageExpanded = !imageExpanded"
        />
        <div v-if="record" class="code-line">入库单号：{{ record.code }}</div>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.confirm-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.image-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.image-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
  font-weight: normal;
}

.inbound-image {
  max-width: 480px;
  max-height: 360px;
  cursor: zoom-in;
  transition: max-width 0.2s, max-height 0.2s;
}

/* 点击放大：仍然是页面内的普通元素，不会用遮罩盖住整个界面，
   表单一直看得见、改得了 —— 需要的话往下滚就能同时看图和填表 */
.inbound-image--expanded {
  max-width: 100%;
  max-height: 90vh;
  cursor: zoom-out;
}

.code-line {
  margin-top: 12px;
  color: #909399;
  font-size: 13px;
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
