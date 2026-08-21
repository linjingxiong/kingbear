<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateProductDto, FactoryListItem, Product } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { createProduct, deleteProduct, listProductsByFactory, updateProduct } from "../../api/product";

const factories = ref<FactoryListItem[]>([]);
const selectedFactoryId = ref<string>("");
const list = ref<Product[]>([]);
const loading = ref(false);

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
});

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
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createProduct(form);
  } else if (editingId.value) {
    await updateProduct(editingId.value, form);
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

onMounted(loadFactories);
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
        <template #default="{ row }">{{ row.factoryPrice.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="加工价（元/个）" width="140" align="right">
        <template #default="{ row }">{{ row.processPrice != null ? row.processPrice.toFixed(2) : "-" }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" />
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
          <el-input-number v-model="form.factoryPrice" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="加工价(元/个)">
          <el-input-number v-model="form.processPrice" :min="0" :precision="2" style="width: 100%" />
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

/* 防止"工厂价(元/个)"这类稍长的 label 在窄列宽度下被截断换行 */
:deep(.el-form-item__label) {
  white-space: nowrap;
}
</style>
