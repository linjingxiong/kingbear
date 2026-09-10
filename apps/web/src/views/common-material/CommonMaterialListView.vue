<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CommonMaterial, CreateCommonMaterialDto } from "@kingbear/shared";
import {
  createCommonMaterial,
  deleteCommonMaterial,
  listCommonMaterials,
  updateCommonMaterial,
} from "../../api/common-material";

const list = ref<CommonMaterial[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateCommonMaterialDto>({ name: "", unit: "", remark: "" });

const rules = {
  name: [{ required: true, message: "请输入物料名称", trigger: "blur" }],
  unit: [{ required: true, message: "请输入计量单位", trigger: "blur" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listCommonMaterials();
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

function openEdit(row: CommonMaterial) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, { name: row.name, unit: row.unit, remark: row.remark ?? "" });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createCommonMaterial(form);
  } else if (editingId.value) {
    await updateCommonMaterial(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: CommonMaterial) {
  await ElMessageBox.confirm(`确定删除通用物料「${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteCommonMaterial(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增通用物料</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="通用物料跟具体产品无关（比如“框”，装成品用的容器），所有代工厂都可能发。它不参与工钱/物料消耗的计算，只跟踪发了多少、回收多少、还有多少在代工厂手里。"
      style="margin-bottom: 12px"
    />

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

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增通用物料' : '编辑通用物料'" width="440px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="物料名称" prop="name">
          <el-input v-model="form.name" placeholder="如：框" />
        </el-form-item>
        <el-form-item label="计量单位" prop="unit">
          <el-input v-model="form.unit" placeholder="如：只" />
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
