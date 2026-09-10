<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateProductGroupDto, FactoryListItem, ProductGroup } from "@kingbear/shared";
import { listFactories } from "../../api/factory";
import { createProductGroup, deleteProductGroup, listProductGroupsByFactory, updateProductGroup } from "../../api/product-group";

const factories = ref<FactoryListItem[]>([]);
const selectedFactoryId = ref<string>("");
const list = ref<ProductGroup[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateProductGroupDto>({ factoryId: "", name: "", remark: "" });

const rules = {
  name: [{ required: true, message: "请输入产品名称", trigger: "blur" }],
};

async function loadFactories() {
  factories.value = await listFactories();
  if (!selectedFactoryId.value && factories.value.length) {
    selectedFactoryId.value = factories.value[0].id;
  }
}

async function loadGroups() {
  if (!selectedFactoryId.value) {
    list.value = [];
    return;
  }
  loading.value = true;
  try {
    list.value = await listProductGroupsByFactory(selectedFactoryId.value);
  } finally {
    loading.value = false;
  }
}

watch(selectedFactoryId, loadGroups);

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  Object.assign(form, { factoryId: selectedFactoryId.value, name: "", remark: "" });
  dialogVisible.value = true;
}

function openEdit(row: ProductGroup) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, { factoryId: row.factoryId, name: row.name, remark: row.remark ?? "" });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createProductGroup(form);
  } else if (editingId.value) {
    const { factoryId: _factoryId, ...updateDto } = form;
    await updateProductGroup(editingId.value, updateDto);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  loadGroups();
}

async function handleDelete(row: ProductGroup) {
  await ElMessageBox.confirm(
    `确定删除产品「${row.name}」吗？删除后，原本归到它下面的工序会变成"未归集"。`,
    "二次确认",
    { type: "warning" },
  );
  await deleteProductGroup(row.id);
  ElMessage.success("已删除");
  loadGroups();
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

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="这里管的是“产品”——工序的父级。比如“火龙果主体”是一个产品，239-1/239-2/239-3 是它的三道工序（在“工序管理”里维护，并归到这里的产品下面）"
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="name" label="产品名称" />
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增产品' : '编辑产品'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="所属玩具厂">
          <el-select v-model="form.factoryId" style="width: 100%" disabled>
            <el-option v-for="f in factories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="产品名称" prop="name">
          <el-input v-model="form.name" />
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
</style>
