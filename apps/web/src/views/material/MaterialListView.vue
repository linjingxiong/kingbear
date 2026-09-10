<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateMaterialDto, Material } from "@kingbear/shared";
import { createMaterial, deleteMaterial, listMaterials, updateMaterial } from "../../api/material";

const list = ref<Material[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateMaterialDto>({ name: "", unit: "", remark: "" });

const rules = {
  name: [{ required: true, message: "请输入物料名称", trigger: "blur" }],
  unit: [{ required: true, message: "请输入计量单位", trigger: "blur" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listMaterials();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  Object.assign(form, { name: "", unit: "", remark: "" });
  dialogVisible.value = true;
}

function openEdit(row: Material) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, { name: row.name, unit: row.unit, remark: row.remark ?? "" });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createMaterial(form);
  } else if (editingId.value) {
    await updateMaterial(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: Material) {
  await ElMessageBox.confirm(`确定删除物料「${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteMaterial(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增物料</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="name" label="物料名称" />
      <el-table-column prop="unit" label="计量单位" width="120" />
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增物料' : '编辑物料'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="物料名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="计量单位" prop="unit">
          <el-input v-model="form.unit" placeholder="个/米/克……" />
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
