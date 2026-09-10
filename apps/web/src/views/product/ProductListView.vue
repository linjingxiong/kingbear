<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type {
  CreateProductDto,
  CreateProductGroupDto,
  FactoryListItem,
  Product,
  ProductGroup,
  ProductGroupMaterial,
  ProductMaterial,
} from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { createProduct, deleteProduct, listProductsByFactory, updateProduct } from "../../api/product";
import {
  createProductGroup,
  deleteProductGroup,
  listProductGroupsByFactory,
  updateProductGroup,
} from "../../api/product-group";

const UNASSIGNED = "__unassigned__";

const factories = ref<FactoryListItem[]>([]);
const selectedFactoryId = ref<string>("");
const groups = ref<ProductGroup[]>([]);
const steps = ref<Product[]>([]);
const loading = ref(false);

function materialsSummary(row: Product) {
  return row.materials.map((m) => `${m.materialName}×${m.qty}`).join("、");
}

// 树形数据：每个产品一个父节点，children 是归到它下面的工序；最后再拼一个"未归集"
// 虚拟父节点，放 productGroupId 为空的工序。row-key 要在父子之间全局唯一。
type GroupNode = {
  rowKey: string;
  kind: "group";
  id: string;
  name: string;
  virtual: boolean;
  materialCount: number;
  children: StepNode[];
};
type StepNode = Product & { rowKey: string; kind: "step" };

const treeData = computed<GroupNode[]>(() => {
  const stepsByGroup = new Map<string, StepNode[]>();
  for (const s of steps.value) {
    const key = s.productGroupId ?? UNASSIGNED;
    const node: StepNode = { ...s, rowKey: `s_${s.id}`, kind: "step" };
    (stepsByGroup.get(key) ?? stepsByGroup.set(key, []).get(key)!).push(node);
  }

  const nodes: GroupNode[] = groups.value.map((g) => ({
    rowKey: `g_${g.id}`,
    kind: "group",
    id: g.id,
    name: g.name,
    virtual: false,
    materialCount: g.materials.length,
    children: stepsByGroup.get(g.id) ?? [],
  }));

  const unassigned = stepsByGroup.get(UNASSIGNED) ?? [];
  if (unassigned.length) {
    nodes.push({
      rowKey: `g_${UNASSIGNED}`,
      kind: "group",
      id: UNASSIGNED,
      name: "未归集",
      virtual: true,
      materialCount: 0,
      children: unassigned,
    });
  }
  return nodes;
});

async function loadFactories() {
  factories.value = await listFactories();
  if (!selectedFactoryId.value && factories.value.length) {
    selectedFactoryId.value = factories.value[0].id;
  }
}

async function loadForFactory() {
  if (!selectedFactoryId.value) {
    groups.value = [];
    steps.value = [];
    return;
  }
  loading.value = true;
  try {
    [groups.value, steps.value] = await Promise.all([
      listProductGroupsByFactory(selectedFactoryId.value),
      listProductsByFactory(selectedFactoryId.value),
    ]);
  } finally {
    loading.value = false;
  }
}

watch(selectedFactoryId, loadForFactory);

/* ---------- 产品（ProductGroup）增删改 ---------- */
const groupDialogVisible = ref(false);
const groupDialogMode = ref<"create" | "edit">("create");
const groupEditingId = ref<string | null>(null);
const groupFormRef = ref<FormInstance>();
const groupForm = reactive<CreateProductGroupDto & { materials: ProductGroupMaterial[] }>({
  factoryId: "",
  name: "",
  remark: "",
  materials: [],
});
const groupRules = { name: [{ required: true, message: "请输入产品名称", trigger: "blur" }] };

function addGroupMaterial() {
  groupForm.materials.push({ name: "", unit: "" });
}
function removeGroupMaterial(index: number) {
  groupForm.materials.splice(index, 1);
}

function openGroupCreate() {
  groupDialogMode.value = "create";
  groupEditingId.value = null;
  Object.assign(groupForm, { factoryId: selectedFactoryId.value, name: "", remark: "", materials: [] });
  groupDialogVisible.value = true;
}
function openGroupEdit(node: GroupNode) {
  groupDialogMode.value = "edit";
  groupEditingId.value = node.id;
  const g = groups.value.find((x) => x.id === node.id);
  Object.assign(groupForm, {
    factoryId: selectedFactoryId.value,
    name: g?.name ?? "",
    remark: g?.remark ?? "",
    materials: (g?.materials ?? []).map((m) => ({ ...m })),
  });
  groupDialogVisible.value = true;
}
async function submitGroup() {
  await groupFormRef.value?.validate();
  // 名字或单位没填全的物料行不提交
  const materials = groupForm.materials.filter((m) => m.name.trim() && m.unit.trim());
  if (groupDialogMode.value === "create") {
    await createProductGroup({ ...groupForm, materials });
  } else if (groupEditingId.value) {
    const { factoryId: _f, ...dto } = groupForm;
    await updateProductGroup(groupEditingId.value, { ...dto, materials });
  }
  ElMessage.success("保存成功");
  groupDialogVisible.value = false;
  loadForFactory();
}
async function deleteGroup(node: GroupNode) {
  await ElMessageBox.confirm(
    `确定删除产品「${node.name}」吗？它下面的 ${node.children.length} 道工序不会被删除，会变成"未归集"。`,
    "二次确认",
    { type: "warning" },
  );
  await deleteProductGroup(node.id);
  ElMessage.success("已删除");
  loadForFactory();
}

/* ---------- 工序（Product）增删改 ---------- */
const stepDialogVisible = ref(false);
const stepDialogMode = ref<"create" | "edit">("create");
const stepEditingId = ref<string | null>(null);
const stepFormRef = ref<FormInstance>();
const stepForm = reactive<CreateProductDto>({
  factoryId: "",
  productGroupId: undefined,
  sku: "",
  name: "",
  factoryPrice: 0,
  processPrice: undefined,
  remark: "",
  materials: [],
});
const stepRules = {
  sku: [{ required: true, message: "请输入货号", trigger: "blur" }],
  name: [{ required: true, message: "请输入工序名称", trigger: "blur" }],
  factoryPrice: [{ required: true, message: "请输入工厂价", trigger: "blur" }],
};

// 工序配方能选的物料 = 所属产品录入的那批（按名字）。已经在配方里、但产品后来又删掉的物料，
// 也一并显示出来（不然那一行会变空白），加个标记提醒
const stepMaterialOptions = computed(() => {
  const group = groups.value.find((g) => g.id === stepForm.productGroupId);
  const allowed = group?.materials ?? [];
  const allowedNames = new Set(allowed.map((m) => m.name));
  const used = (stepForm.materials ?? []).map((m) => m.materialName).filter((n) => n && !allowedNames.has(n));
  return [
    ...allowed.map((m) => ({ name: m.name, unit: m.unit, stale: false })),
    ...used.map((name) => ({ name, unit: "", stale: true })),
  ];
});

function openStepCreate(productGroupId?: string) {
  stepDialogMode.value = "create";
  stepEditingId.value = null;
  Object.assign(stepForm, {
    factoryId: selectedFactoryId.value,
    productGroupId: productGroupId && productGroupId !== UNASSIGNED ? productGroupId : undefined,
    sku: "",
    name: "",
    factoryPrice: 0,
    processPrice: undefined,
    remark: "",
    materials: [],
  });
  stepDialogVisible.value = true;
}
function openStepEdit(row: StepNode) {
  stepDialogMode.value = "edit";
  stepEditingId.value = row.id;
  Object.assign(stepForm, {
    factoryId: row.factoryId,
    productGroupId: row.productGroupId,
    sku: row.sku,
    name: row.name,
    factoryPrice: row.factoryPrice,
    processPrice: row.processPrice,
    remark: row.remark ?? "",
    materials: row.materials.map((m) => ({ ...m })),
  });
  stepDialogVisible.value = true;
}
function addStepMaterial() {
  stepForm.materials!.push({ materialName: "", qty: 0 });
}
function removeStepMaterial(index: number) {
  stepForm.materials!.splice(index, 1);
}
function buildMaterialsPayload(): ProductMaterial[] {
  return (stepForm.materials ?? []).filter((m) => m.materialName);
}
async function submitStep() {
  await stepFormRef.value?.validate();
  const materialsPayload = buildMaterialsPayload();
  if (stepDialogMode.value === "create") {
    await createProduct({ ...stepForm, materials: materialsPayload });
  } else if (stepEditingId.value) {
    const { factoryId: _f, ...dto } = stepForm;
    await updateProduct(stepEditingId.value, { ...dto, materials: materialsPayload });
  }
  ElMessage.success("保存成功");
  stepDialogVisible.value = false;
  loadForFactory();
}
async function deleteStep(row: StepNode) {
  await ElMessageBox.confirm(`确定删除工序「${row.sku} · ${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteProduct(row.id);
  ElMessage.success("已删除");
  loadForFactory();
}

onMounted(loadFactories);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-select v-model="selectedFactoryId" placeholder="选择玩具厂" style="width: 220px">
        <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
      </el-select>
      <el-button type="primary" :disabled="!selectedFactoryId" @click="openGroupCreate">新增产品</el-button>
      <el-button :disabled="!selectedFactoryId" @click="openStepCreate()">新增工序</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="产品是父级（比如“火龙果主体”），新建产品时直接录入它用到的物料（名字 + 单位）。下面挂工序（前壳半成品 / 后壳半成品 / 压杆），工序的物料配方只能从所属产品录的那批物料里选。工厂价、入库、应收账单仍按工序/货号来算，还没归到产品的工序放在“未归集”里。"
      style="margin-bottom: 12px"
    />

    <el-table
      v-loading="loading"
      :data="treeData"
      row-key="rowKey"
      default-expand-all
      :tree-props="{ children: 'children' }"
      border
    >
      <el-table-column label="产品 / 工序" min-width="260">
        <template #default="{ row }">
          <template v-if="row.kind === 'group'">
            <strong>{{ row.name }}</strong>
            <span class="child-count">
              （{{ row.children.length }} 道工序<template v-if="!row.virtual"> · {{ row.materialCount }} 种物料</template>）
            </span>
          </template>
          <template v-else>
            <span class="step-sku">{{ row.sku }}</span>
            <span class="step-name">{{ row.name }}</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="工厂价（元/个）" width="130" align="right">
        <template #default="{ row }">
          <span v-if="row.kind === 'step'">{{ row.factoryPrice.toFixed(4) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="加工价（元/个）" width="130" align="right">
        <template #default="{ row }">
          <span v-if="row.kind === 'step'">{{ row.processPrice != null ? row.processPrice.toFixed(4) : "-" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="物料配方" width="120">
        <template #default="{ row }">
          <template v-if="row.kind === 'step'">
            <el-tooltip v-if="row.materials.length" :content="materialsSummary(row)" placement="left">
              <span class="material-count">{{ row.materials.length }} 种物料</span>
            </el-tooltip>
            <span v-else class="muted">未设置</span>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" show-overflow-tooltip>
        <template #default="{ row }">{{ row.kind === "step" ? row.remark : "" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <template v-if="row.kind === 'group' && !row.virtual">
            <el-button link type="primary" @click="openStepCreate(row.id)">加工序</el-button>
            <el-button link type="primary" @click="openGroupEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteGroup(row)">删除</el-button>
          </template>
          <template v-else-if="row.kind === 'step'">
            <el-button link type="primary" @click="openStepEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="deleteStep(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 产品弹窗 -->
    <el-dialog
      v-model="groupDialogVisible"
      :title="groupDialogMode === 'create' ? '新增产品' : '编辑产品'"
      width="520px"
    >
      <el-form ref="groupFormRef" :model="groupForm" :rules="groupRules" label-width="110px">
        <el-form-item label="产品名称" prop="name">
          <el-input v-model="groupForm.name" />
        </el-form-item>
        <el-form-item label="本产品用到的物料">
          <div class="material-editor">
            <div v-for="(m, idx) in groupForm.materials" :key="idx" class="material-row">
              <el-input v-model="m.name" placeholder="物料名，如：塑料A" style="width: 220px" />
              <el-input v-model="m.unit" placeholder="单位，如：斤" style="width: 100px" />
              <el-button link type="danger" @click="removeGroupMaterial(idx)">删除</el-button>
            </div>
            <el-button @click="addGroupMaterial">+ 添加物料</el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="groupForm.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 工序弹窗 -->
    <el-dialog
      v-model="stepDialogVisible"
      :title="stepDialogMode === 'create' ? '新增工序' : '编辑工序'"
      width="520px"
    >
      <el-form ref="stepFormRef" :model="stepForm" :rules="stepRules" label-width="120px">
        <el-form-item label="所属产品">
          <el-select v-model="stepForm.productGroupId" clearable filterable placeholder="选择产品（可留空 = 未归集）" style="width: 100%">
            <el-option v-for="g in groups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="货号" prop="sku">
          <el-input v-model="stepForm.sku" />
        </el-form-item>
        <el-form-item label="工序名称" prop="name">
          <el-input v-model="stepForm.name" />
        </el-form-item>
        <el-form-item label="工厂价(元/个)" prop="factoryPrice">
          <el-input-number v-model="stepForm.factoryPrice" :min="0" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="加工价(元/个)">
          <el-input-number v-model="stepForm.processPrice" :min="0" :precision="4" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="stepForm.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item label="物料配方">
          <div class="material-editor">
            <el-alert
              v-if="!stepForm.productGroupId"
              type="warning"
              :closable="false"
              show-icon
              title="请先把这道工序归到某个产品下，物料只能从该产品录的那批里选"
            />
            <el-alert
              v-else-if="!stepMaterialOptions.length"
              type="warning"
              :closable="false"
              show-icon
              title="所属产品还没录入任何物料，先去产品那里录一下"
            />
            <template v-else>
              <div v-for="(usage, idx) in stepForm.materials" :key="idx" class="material-row">
                <el-select v-model="usage.materialName" filterable placeholder="选择物料" style="width: 240px">
                  <el-option
                    v-for="m in stepMaterialOptions"
                    :key="m.name"
                    :label="`${m.name}${m.unit ? `（${m.unit}）` : ''}${m.stale ? ' ⚠ 已不在产品物料里' : ''}`"
                    :value="m.name"
                  />
                </el-select>
                <el-input-number v-model="usage.qty" :min="0" :precision="2" controls-position="right" style="width: 140px" />
                <el-button link type="danger" @click="removeStepMaterial(idx)">删除</el-button>
              </div>
              <el-button @click="addStepMaterial">+ 添加物料</el-button>
            </template>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stepDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitStep">保存</el-button>
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

.child-count {
  color: #909399;
  font-size: 12px;
  margin-left: 6px;
}

.step-sku {
  display: inline-block;
  min-width: 64px;
  color: #606266;
  font-variant-numeric: tabular-nums;
}

.step-name {
  margin-left: 8px;
}

.material-count {
  color: #409eff;
  cursor: help;
}

.muted {
  color: #c0c4cc;
  font-size: 13px;
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

:deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
