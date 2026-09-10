<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CreateMaterialIssuanceDto, Material, MaterialIssuanceListItem, OemFactory } from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listMaterials } from "../../api/material";
import {
  createMaterialIssuance,
  deleteMaterialIssuance,
  listMaterialIssuances,
  updateMaterialIssuance,
} from "../../api/material-issuance";

const oemFactories = ref<OemFactory[]>([]);
const materials = ref<Material[]>([]);
const list = ref<MaterialIssuanceListItem[]>([]);
const loading = ref(false);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateMaterialIssuanceDto>({
  oemFactoryId: "",
  materialId: "",
  qty: 0,
  issuedDate: "",
  remark: "",
});

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  materialId: [{ required: true, message: "请选择物料", trigger: "change" }],
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
  Object.assign(form, { oemFactoryId: "", materialId: "", qty: 0, issuedDate: "", remark: "" });
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
    materialId: row.materialId,
    qty: row.qty,
    issuedDate: row.issuedDate,
    remark: row.remark ?? "",
  });
  dialogVisible.value = true;
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
  await ElMessageBox.confirm(`确定删除这条「${row.oemFactoryName} · ${row.materialName}」的发料记录吗？`, "二次确认", {
    type: "warning",
  });
  await deleteMaterialIssuance(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(async () => {
  oemFactories.value = await listOemFactories();
  materials.value = await listMaterials();
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
        <el-form-item label="物料" prop="materialId">
          <el-select v-model="form.materialId" filterable style="width: 100%">
            <el-option v-for="m in materials" :key="m.id" :label="`${m.name}（${m.unit}）`" :value="m.id" />
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
