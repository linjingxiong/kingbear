<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type {
  CommonMaterial,
  CommonMaterialReturnListItem,
  CreateCommonMaterialReturnDto,
  OemFactory,
} from "@kingbear/shared";
import { listOemFactories } from "../../api/oem-factory";
import { listCommonMaterials } from "../../api/common-material";
import {
  createCommonMaterialReturn,
  deleteCommonMaterialReturn,
  listCommonMaterialReturns,
  updateCommonMaterialReturn,
} from "../../api/common-material-return";

const oemFactories = ref<OemFactory[]>([]);
const commonMaterials = ref<CommonMaterial[]>([]);
const list = ref<CommonMaterialReturnListItem[]>([]);
const loading = ref(false);

const selectedUnit = computed(
  () => commonMaterials.value.find((m) => m.name === form.commonMaterialName)?.unit ?? "",
);

const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CreateCommonMaterialReturnDto>({
  oemFactoryId: "",
  commonMaterialName: "",
  qty: 0,
  returnedDate: "",
  remark: "",
});

const rules = {
  oemFactoryId: [{ required: true, message: "请选择代工厂", trigger: "change" }],
  commonMaterialName: [{ required: true, message: "请选择通用物料", trigger: "change" }],
  qty: [{ required: true, message: "请输入数量", trigger: "blur" }],
  returnedDate: [{ required: true, message: "请选择归还日期", trigger: "change" }],
};

async function load() {
  loading.value = true;
  try {
    list.value = await listCommonMaterialReturns();
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(form, { oemFactoryId: "", commonMaterialName: "", qty: 0, returnedDate: "", remark: "" });
}

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: CommonMaterialReturnListItem) {
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    oemFactoryId: row.oemFactoryId,
    commonMaterialName: row.commonMaterialName,
    qty: row.qty,
    returnedDate: (row.returnedDate ?? "").slice(0, 10),
    remark: row.remark ?? "",
  });
  dialogVisible.value = true;
}

async function handleSubmit() {
  await formRef.value?.validate();
  if (dialogMode.value === "create") {
    await createCommonMaterialReturn(form);
  } else if (editingId.value) {
    await updateCommonMaterialReturn(editingId.value, form);
  }
  ElMessage.success("保存成功");
  dialogVisible.value = false;
  load();
}

async function handleDelete(row: CommonMaterialReturnListItem) {
  await ElMessageBox.confirm(
    `确定删除这条「${row.oemFactoryName} · ${row.commonMaterialName}」的回收记录吗？`,
    "二次确认",
    { type: "warning" },
  );
  await deleteCommonMaterialReturn(row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(async () => {
  oemFactories.value = await listOemFactories();
  commonMaterials.value = await listCommonMaterials();
  load();
});
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增回收</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="记录代工厂把通用物料（框等）还回来的数量。结余（在物料对账里看）= 已发 - 已回收。"
      style="margin-bottom: 12px"
    />

    <el-table v-loading="loading" :data="list" border>
      <el-table-column prop="oemFactoryName" label="代工厂" width="150" />
      <el-table-column prop="commonMaterialName" label="通用物料" width="150" />
      <el-table-column label="回收数量" width="130" align="right">
        <template #default="{ row }">{{ row.qty.toLocaleString() }} {{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="归还日期" width="120">
        <template #default="{ row }">{{ (row.returnedDate ?? "").slice(0, 10) }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" show-overflow-tooltip />
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="dialogMode === 'create' ? '新增回收' : '编辑回收'" width="460px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="代工厂" prop="oemFactoryId">
          <el-select v-model="form.oemFactoryId" style="width: 100%">
            <el-option v-for="f in oemFactories" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="通用物料" prop="commonMaterialName">
          <el-select v-model="form.commonMaterialName" filterable style="width: 100%">
            <el-option v-for="m in commonMaterials" :key="m.id" :label="`${m.name}（${m.unit}）`" :value="m.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="回收数量" prop="qty">
          <el-input-number v-model="form.qty" :min="0" controls-position="right" style="width: 100%" />
          <span v-if="selectedUnit" class="unit-hint">{{ selectedUnit }}</span>
        </el-form-item>
        <el-form-item label="归还日期" prop="returnedDate">
          <el-date-picker v-model="form.returnedDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
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
.unit-hint {
  margin-left: 8px;
  color: #909399;
}
</style>
