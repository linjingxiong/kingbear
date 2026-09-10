<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateProductDto, FactoryListItem, Material, Product, ProductGroup, ProductMaterial } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { createProduct, deleteProduct, listProductsByFactory, updateProduct } from "../../api/product";
import { listProductGroupsByFactory } from "../../api/product-group";
import { listMaterials } from "../../api/material";

const factories = ref<FactoryListItem[]>([]);
const selectedFactoryId = ref<string>("");
const list = ref<Product[]>([]);
const loading = ref(false);

// 选物料的下拉框候选项——全局物料目录，跟代工厂/资产盘点那边共用同一份
const materials = ref<Material[]>([]);
function materialName(id: string) {
  return materials.value.find((m) => m.id === id)?.name ?? "";
}

// "所属产品"下拉框候选项——跟着选中的玩具厂走
const productGroups = ref<ProductGroup[]>([]);
function productGroupName(id?: string) {
  if (!id) return "";
  return productGroups.value.find((g) => g.id === id)?.name ?? "";
}

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateProductDto>({
  factoryId: "",
  productGroupId: undefined,
  sku: "",
  name: "",
  factoryPrice: 0,
  processPrice: undefined,
  remark: "",
  materials: [],
});

// 表格里"物料配方"列的悬浮提示文字
function materialsSummary(row: Product) {
  return row.materials.map((m) => `${materialName(m.materialId)}×${m.qty}`).join("、");
}

function addMaterial() {
  form.materials!.push({ materialId: "", qty: 0 });
}

function removeMaterial(index: number) {
  form.materials!.splice(index, 1);
}

const rules = {
  factoryId: [{ required: true, message: "请选择所属玩具厂", trigger: "change" }],
  sku: [{ required: true, message: "请输入货号", trigger: "blur" }],
  name: [{ required: true, message: "请输入工序名称", trigger: "blur" }],
  factoryPrice: [{ required: true, message: "请输入工厂价", trigger: "blur" }],
};

async function loadFactories() {
  factories.value = await listFactories();
  if (!selectedFactoryId.value && factories.value.length) {
    selectedFactoryId.value = factories.value[0].id;
  }
}

async function loadForFactory() {
  if (!selectedFactoryId.value) {
    list.value = [];
    productGroups.value = [];
    return;
  }
  loading.value = true;
  try {
    [list.value, productGroups.value] = await Promise.all([
      listProductsByFactory(selectedFactoryId.value),
      listProductGroupsByFactory(selectedFactoryId.value),
    ]);
  } finally {
    loading.value = false;
  }
}

watch(selectedFactoryId, loadForFactory);

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  Object.assign(form, {
    factoryId: selectedFactoryId.value,
    productGroupId: undefined,
    sku: "",
    name: "",
    factoryPrice: 0,
    processPrice: undefined,
    remark: "",
    materials: [],
  });
  dialogVisible.value = true;
}

function openEdit(row: Product) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    factoryId: row.factoryId,
    productGroupId: row.productGroupId,
    sku: row.sku,
    name: row.name,
    factoryPrice: row.factoryPrice,
    processPrice: row.processPrice,
    remark: row.remark ?? "",
    // 深拷贝，改弹窗里的配方不会直接动到列表里已经渲染出来的那条
    materials: row.materials.map((m) => ({ ...m })),
  });
  dialogVisible.value = true;
}

// 物料没选的行直接丢掉，不然会被后端校验拦下来报一堆看不懂的错
function buildMaterialsPayload(): ProductMaterial[] {
  return (form.materials ?? []).filter((m) => m.materialId);
}

async function handleSubmit() {
  await formRef.value?.validate();
  const materialsPayload = buildMaterialsPayload();
  if (dialogMode.value === "create") {
    await createProduct({ ...form, materials: materialsPayload });
  } else if (editingId.value) {
    // 编辑时后端 DTO 不允许传 factoryId（工序归属的玩具厂不可改），剔除掉再提交
    const { factoryId: _factoryId, ...updateDto } = form;
    await updateProduct(editingId.value, { ...updateDto, materials: materialsPayload });
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  loadForFactory();
}

async function handleDelete(row: Product) {
  await ElMessageBox.confirm(`确定删除工序「${row.sku} · ${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteProduct(row.id);
  ElMessage.success("已删除");
  loadForFactory();
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
      <el-button type="primary" :disabled="!selectedFactoryId" @click="openCreate">新增工序</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="这里的每一条（带货号）是一道“工序”，归到一个“产品”下面（产品在“产品管理”里维护）。工厂价、入库、应收账单都还是按这里的工序/货号来算。"
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="sku" label="货号" width="120" />
      <el-table-column prop="name" label="工序名称" />
      <el-table-column label="所属产品" width="140">
        <template #default="{ row }">
          <span v-if="row.productGroupId">{{ productGroupName(row.productGroupId) }}</span>
          <span v-else class="unassigned">未归集</span>
        </template>
      </el-table-column>
      <el-table-column label="工厂价（元/个）" width="130" align="right">
        <template #default="{ row }">{{ row.factoryPrice.toFixed(4) }}</template>
      </el-table-column>
      <el-table-column label="加工价（元/个）" width="130" align="right">
        <template #default="{ row }">{{ row.processPrice != null ? row.processPrice.toFixed(4) : "-" }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="物料配方" width="120">
        <template #default="{ row }">
          <el-tooltip v-if="row.materials.length" :content="materialsSummary(row)" placement="left">
            <span class="material-count">{{ row.materials.length }} 种物料</span>
          </el-tooltip>
          <span v-else class="no-material">未设置</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增工序' : '编辑工序'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" label-position="right">
        <el-form-item label="所属玩具厂" prop="factoryId">
          <el-select v-model="form.factoryId" style="width: 100%" :disabled="dialogMode === 'edit'">
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="所属产品">
          <el-select v-model="form.productGroupId" clearable filterable placeholder="选择产品（可留空）" style="width: 100%">
            <el-option v-for="g in productGroups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="货号" prop="sku">
          <el-input v-model="form.sku" />
        </el-form-item>
        <el-form-item label="工序名称" prop="name">
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
        <!-- 物料配方：这道工序耗哪些物料、各耗多少（每单位货号的用量），代工厂物料对账
             （已发/应耗/结余）就是靠这个算的，不填也能正常保存 -->
        <el-form-item label="物料配方">
          <div class="material-editor">
            <div v-for="(usage, idx) in form.materials" :key="idx" class="material-row">
              <el-select v-model="usage.materialId" filterable placeholder="选择物料" style="width: 220px">
                <el-option v-for="m in materials" :key="m.id" :label="`${m.name}（${m.unit}）`" :value="m.id" />
              </el-select>
              <el-input-number v-model="usage.qty" :min="0" :precision="2" controls-position="right" style="width: 140px" />
              <el-button link type="danger" @click="removeMaterial(idx)">删除</el-button>
            </div>
            <el-button @click="addMaterial">+ 添加物料</el-button>
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

.unassigned,
.no-material {
  color: #c0c4cc;
  font-size: 13px;
}

.material-count {
  color: #409eff;
  cursor: help;
}

.material-editor {
  width: 100%;
}

.material-row {
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
