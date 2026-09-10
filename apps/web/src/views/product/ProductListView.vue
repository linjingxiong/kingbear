<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateProductDto, FactoryListItem, Material, Product, ProcessStep } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { createProduct, deleteProduct, listProductsByFactory, updateProduct } from "../../api/product";
import { listMaterials } from "../../api/material";

const factories = ref<FactoryListItem[]>([]);
const selectedFactoryId = ref<string>("");
const list = ref<Product[]>([]);
const loading = ref(false);

// 工序里"选物料"这个下拉框的候选项——全局物料目录，跟代工厂/资产盘点那边共用同一份
const materials = ref<Material[]>([]);
function materialName(id: string) {
  return materials.value.find((m) => m.id === id)?.name ?? "";
}

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateProductDto>({
  factoryId: "",
  sku: "",
  name: "",
  factoryPrice: 0,
  processPrice: undefined,
  remark: "",
  processes: [],
});

// 表格里"工序/配方"列的悬浮提示文字，拼出"工序名：物料×数量、物料×数量"
function stepSummary(step: ProcessStep) {
  return `${step.name}：${step.materials.map((m) => `${materialName(m.materialId)}×${m.qty}`).join("、")}`;
}

// 工序/物料配方的增删改——每道工序至少留一行物料，方便直接改配比，不用先点"添加"
function addProcessStep() {
  form.processes!.push({ name: "", materials: [{ materialId: "", qty: 0 }] });
}

function removeProcessStep(index: number) {
  form.processes!.splice(index, 1);
}

function addProcessMaterial(step: ProcessStep) {
  step.materials.push({ materialId: "", qty: 0 });
}

function removeProcessMaterial(step: ProcessStep, index: number) {
  step.materials.splice(index, 1);
}

const rules = {
  factoryId: [{ required: true, message: "请选择所属玩具厂", trigger: "change" }],
  sku: [{ required: true, message: "请输入货号", trigger: "blur" }],
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  factoryPrice: [{ required: true, message: "请输入工厂价", trigger: "blur" }],
};

async function loadFactories() {
  factories.value = await listFactories();
  if (!selectedFactoryId.value && factories.value.length) {
    selectedFactoryId.value = factories.value[0].id;
  }
}

async function loadProducts() {
  if (!selectedFactoryId.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    list.value = await listProductsByFactory(selectedFactoryId.value);
  } finally {
    loading.value = false;
  }
}

watch(selectedFactoryId, loadProducts);

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  Object.assign(form, {
    factoryId: selectedFactoryId.value,
    sku: "",
    name: "",
    factoryPrice: 0,
    processPrice: undefined,
    remark: "",
    processes: [],
  });
  dialogVisible.value = true;
}

function openEdit(row: Product) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    factoryId: row.factoryId,
    sku: row.sku,
    name: row.name,
    factoryPrice: row.factoryPrice,
    processPrice: row.processPrice,
    remark: row.remark ?? "",
    // 深拷贝一份，改弹窗里的工序不会直接改到列表里已经渲染出来的那条数据
    processes: row.processes.map((step) => ({ name: step.name, materials: step.materials.map((m) => ({ ...m })) })),
  });
  dialogVisible.value = true;
}

// 没填完的工序/物料行不提交——工序名留空、或者物料没选的行直接丢掉；一道工序丢到一个
// 物料都不剩就把这道工序也丢掉，不然会被后端"至少一种物料""工序名必填"的校验拦下来，
// 报一堆用户看不懂的错误
function buildProcessesPayload(): ProcessStep[] {
  return (form.processes ?? [])
    .filter((step) => step.name.trim())
    .map((step) => ({ name: step.name, materials: step.materials.filter((m) => m.materialId) }))
    .filter((step) => step.materials.length > 0);
}

async function handleSubmit() {
  await formRef.value?.validate();
  const processes = buildProcessesPayload();
  if (dialogMode.value === "create") {
    await createProduct({ ...form, processes });
  } else if (editingId.value) {
    // 编辑时后端 DTO 不允许传 factoryId（产品归属的玩具厂不可改），这里剔除掉再提交，
    // 不然会被全局校验的 forbidNonWhitelisted 拦下来报 "property factoryId should not exist"
    const { factoryId: _factoryId, ...updateDto } = form;
    await updateProduct(editingId.value, { ...updateDto, processes });
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  loadProducts();
}

async function handleDelete(row: Product) {
  await ElMessageBox.confirm(`确定删除产品「${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteProduct(row.id);
  ElMessage.success("已删除");
  loadProducts();
}

onMounted(async () => {
  await loadFactories();
  materials.value = await listMaterials();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-select v-model="selectedFactoryId" placeholder="选择玩具厂" style="width: 220px">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-button type="primary" :disabled="!selectedFactoryId" @click="openCreate">新增产品</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="sku" label="货号" width="140" />
      <el-table-column prop="name" label="名称" />
      <el-table-column label="工厂价（元/个）" width="140" align="right">
        <template #default="{ row }">{{ row.factoryPrice.toFixed(4) }}</template>
      </el-table-column>
      <el-table-column label="加工价（元/个）" width="140" align="right">
        <template #default="{ row }">{{ row.processPrice != null ? row.processPrice.toFixed(4) : "-" }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" />
      <el-table-column label="工序/配方" width="120">
        <template #default="{ row }">
          <el-tooltip v-if="row.processes.length" placement="left">
            <template #content>
              <div v-for="(step, idx) in row.processes" :key="idx">{{ stepSummary(step) }}</div>
            </template>
            <span class="process-count">{{ row.processes.length }} 道工序</span>
          </el-tooltip>
          <span v-else class="no-process">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增产品' : '编辑产品'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" label-position="right">
        <el-form-item label="所属玩具厂" prop="factoryId">
          <el-select v-model="form.factoryId" style="width: 100%" :disabled="dialogMode === 'edit'">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="货号" prop="sku">
          <el-input v-model="form.sku" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="工厂价(元/个)" prop="factoryPrice">
          <el-input-number v-model="form.factoryPrice" :min="0" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="加工价(元/个)">
          <el-input-number v-model="form.processPrice" :min="0" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <!-- 工序/物料配方：代工厂做这个产品要经过哪几道工序、每道工序耗哪些物料、配比多少，
             物料对账（已发/应耗/结余）就是靠这个算出来的，不填也能正常保存产品 -->
        <el-form-item label="工序/物料配方">
          <div class="process-editor">
            <div v-for="(step, stepIdx) in form.processes" :key="stepIdx" class="process-step">
              <div class="process-step-header">
                <el-input v-model="step.name" placeholder="工序名称，如：组装" style="width: 200px" />
                <el-button link type="danger" @click="removeProcessStep(stepIdx)">删除工序</el-button>
              </div>
              <div v-for="(usage, matIdx) in step.materials" :key="matIdx" class="process-material-row">
                <el-select v-model="usage.materialId" filterable placeholder="选择物料" style="width: 200px">
                  <el-option v-for="m in materials" :key="m.id" :label="`${m.name}（${m.unit}）`" :value="m.id" />
                </el-select>
                <el-input-number v-model="usage.qty" :min="0" :precision="2" controls-position="right" style="width: 140px" />
                <el-button link type="danger" @click="removeProcessMaterial(step, matIdx)">删除</el-button>
              </div>
              <el-button link type="primary" @click="addProcessMaterial(step)">+ 添加物料</el-button>
            </div>
            <el-button @click="addProcessStep">+ 添加工序</el-button>
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
  display: flex;
  gap: 12px;
}

.process-count {
  color: #409eff;
  cursor: help;
}

.no-process {
  color: #c0c4cc;
  font-size: 13px;
}

.process-editor {
  width: 100%;
}

.process-step {
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 12px;
}

.process-step-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.process-material-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

/* 防止"工厂价(元/个)"这类稍长的 label 在窄列宽度下被截断换行 */
:deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
