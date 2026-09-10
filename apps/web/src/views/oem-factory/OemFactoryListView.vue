<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateOemFactoryDto, OemFactory } from "@kingbear/shared";
import { createOemFactory, deleteOemFactory, listOemFactories, updateOemFactory } from "../../api/oem-factory";

const list = ref<OemFactory[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateOemFactoryDto>({ name: "", contact: "", phone: "", address: "", remark: "" });

const rules = {
  name: [{ required: true, message: "请输入代工厂名称", trigger: "blur" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listOemFactories();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  Object.assign(form, { name: "", contact: "", phone: "", address: "", remark: "" });
  dialogVisible.value = true;
}

function openEdit(row: OemFactory) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    contact: row.contact ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
    remark: row.remark ?? "",
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createOemFactory(form);
  } else if (editingId.value) {
    await updateOemFactory(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: OemFactory) {
  await ElMessageBox.confirm(`确定删除代工厂「${row.name}」吗？`, "二次确认", { type: "warning" });
  await deleteOemFactory(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增代工厂</el-button>
    </div>

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="name" label="代工厂名称" />
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column prop="phone" label="联系电话" width="140" />
      <el-table-column prop="address" label="地址" show-overflow-tooltip />
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增代工厂' : '编辑代工厂'" width="480px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="代工厂名称" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="联系人">
          <el-input v-model="form.contact" />
        </el-form-item>
        <el-form-item label="电话">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item label="地址">
          <el-input v-model="form.address" />
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
