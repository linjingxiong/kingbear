<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type {
  CreateMaterialIssuanceDto,
  FactoryListItem,
  MaterialIssuanceListItem,
  OemFactory,
  ProductGroup,
} from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listFactories } from "../../api/factory";
import { listProductGroupsByFactory } from "../../api/product-group";
import {
  createMaterialIssuance,
  deleteMaterialIssuance,
  listMaterialIssuances,
  updateMaterialIssuance,
} from "../../api/material-issuance";

const oemFactories = ref<OemFactory[]>([]);
// 产品是按玩具厂分的，发料时可以给任意玩具厂的产品发，所以全量取一遍
const productGroups = ref<(ProductGroup & { factoryName: string })[]>([]);
const list = ref<MaterialIssuanceListItem[]>([]);
const loading = ref(false);

async function loadProductGroups() {
  const factories: FactoryListItem[] = await listFactories();
  const lists = await Promise.all(factories.map((f) => listProductGroupsByFactory(f.id)));
  productGroups.value = lists.flatMap((groups, i) =>
    groups.map((g) => ({ ...g, factoryName: factories[i].name })),
  );
}

// 选中产品后，物料名下拉的候选项 = 这个产品录入的物料
const materialOptions = computed(() => {
  return productGroups.value.find((g) => g.id === form.productGroupId)?.materials ?? [];
});

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateMaterialIssuanceDto>({
  oemFactoryId: "",
  productGroupId: "",
  materialName: "",
  qty: 0,
  issuedDate: "",
  remark: "",
});

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  productGroupId: [{ required: true, message: "请选择产品", trigger: "change" }],
  materialName: [{ required: true, message: "请选择物料", trigger: "change" }],
  qty: [{ required: true, message: "请输入数量", trigger: "blur" }],
  issuedDate: [{ required: true, message: "请选择发放日期", trigger: "change" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listMaterialIssuances();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, { oemFactoryId: "", productGroupId: "", materialName: "", qty: 0, issuedDate: "", remark: "" });
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: MaterialIssuanceListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    oemFactoryId: row.oemFactoryId,
    productGroupId: row.productGroupId,
    materialName: row.materialName,
    qty: row.qty,
    issuedDate: row.issuedDate,
    remark: row.remark ?? "",
  });
  dialogVisible.value = true;
}

// 换产品时，原来选的物料可能不属于新产品，清掉
function onProductGroupChange() {
  if (!materialOptions.value.some((m) => m.name === form.materialName)) {
    form.materialName = "";
  }
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createMaterialIssuance(form);
  } else if (editingId.value) {
    await updateMaterialIssuance(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: MaterialIssuanceListItem) {
  await ElMessageBox.confirm(
    `确定删除这条「${row.oemFactoryName} · ${row.productGroupName} · ${row.materialName}」的发料记录吗？`,
    "二次确认",
    { type: "warning" },
  );
  await deleteMaterialIssuance(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(async () => {
  oemFactories.value = await listOemFactories();
  await loadProductGroups();
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增发料</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="oemFactoryName" label="代工厂" width="140" />
      <el-table-column prop="productGroupName" label="产品" width="140" />
      <el-table-column prop="materialName" label="物料" width="140" />
      <el-table-column label="数量" width="120" align="right">
        <template #default="{ row }">{{ row.qty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column prop="issuedDate" label="发放日期" width="120" />
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增发料' : '编辑发料'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="代工厂" prop="oemFactoryId">
          <el-select v-model="form.oemFactoryId" style="width: 100%">
            <el-option v-for="f in oemFactories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品" prop="productGroupId">
          <el-select v-model="form.productGroupId" filterable style="width: 100%" @change="onProductGroupChange">
            <el-option
              v-for="g in productGroups"
              :key="g.id"
              :label="`${g.name}（${g.factoryName}）`"
              :value="g.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="物料" prop="materialName">
          <el-select v-model="form.materialName" filterable :disabled="!form.productGroupId" style="width: 100%">
            <el-option v-for="m in materialOptions" :key="m.name" :label="`${m.name}（${m.unit}）`" :value="m.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量" prop="qty">
          <el-input-number v-model="form.qty" :min="0" controls-position="right" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发放日期" prop="issuedDate">
          <el-date-picker v-model="form.issuedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
}
</style>
