<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import { ElMessage, ElMessageBox, type FormInstance } from "element-plus";
import type { CounterpartyRole, CreateFactoryDto, PartyListItem, PartyRole } from "@kingbear/shared";
import { deleteParty, listParties } from "../../api/party";
import { createFactory, updateFactory } from "../../api/factory";
import { createOemFactory, updateOemFactory } from "../../api/oem-factory";
import { PARTY_ROLE_LABEL } from "./party-labels";

// 往来单位：我打交道的对象——上游的玩具厂、下游的代工厂（以后还有工人/加工代理）放在一个列表里，
// 新增/编辑/删除也都在这一页（原来"玩具厂管理""代工厂管理"两个页面合并到了这里）。
// 数据库里玩具厂和代工厂还是各自的表，新增/编辑按所选类型调各自原来的接口，一条数据都没动；
// "我"是固定的虚拟节点，只能看总账，不能编辑/删除
const router = useRouter();
const list = ref<PartyListItem[]>([]);
const loading = ref(false);
const roleFilter = ref<"" | PartyRole>("");

const filtered = computed(() => (roleFilter.value ? list.value.filter((p) => p.role === roleFilter.value) : list.value));

async function load() {
  loading.value = true;
  try {
    list.value = await listParties();
  } finally {
    loading.value = false;
  }
}

// 玩具厂橙色、代工厂绿色、"我"蓝色——一眼分出货在哪一环
function roleTagType(role: PartyRole) {
  return role === "toy_factory" ? "warning" : role === "oem_factory" ? "success" : "primary";
}

function openDetail(p: PartyListItem) {
  router.push(`/party/${p.role}/${p.id}`);
}

/* ---------- 新增 / 编辑 ---------- */
const dialogVisible = ref(false);
const dialogMode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const saving = ref(false);
const form = reactive<CreateFactoryDto & { role: CounterpartyRole }>({
  role: "toy_factory",
  name: "",
  contact: "",
  phone: "",
  address: "",
  remark: "",
});

const rules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
};

function openCreate() {
  dialogMode.value = "create";
  editingId.value = null;
  // 当前筛选着哪一类，新增时就默认选哪一类
  const role: CounterpartyRole = roleFilter.value === "oem_factory" ? "oem_factory" : "toy_factory";
  Object.assign(form, { role, name: "", contact: "", phone: "", address: "", remark: "" });
  dialogVisible.value = true;
}

function openEdit(row: PartyListItem) {
  if (row.role === "me") return;
  dialogMode.value = "edit";
  editingId.value = row.id;
  Object.assign(form, {
    role: row.role,
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
  const { role, ...dto } = form;
  saving.value = true;
  try {
    if (dialogMode.value === "create") {
      await (role === "toy_factory" ? createFactory(dto) : createOemFactory(dto));
    } else if (editingId.value) {
      await (role === "toy_factory" ? updateFactory(editingId.value, dto) : updateOemFactory(editingId.value, dto));
    }
    ElMessage.success("保存成功");
    dialogVisible.value = false;
    load();
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row: PartyListItem) {
  if (row.role === "me") return;
  await ElMessageBox.confirm(`确定删除${PARTY_ROLE_LABEL[row.role]}「${row.name}」吗？`, "二次确认", { type: "warning" });
  // 服务端会检查：这个单位下已经有产品/单据的一律拒绝删除，不会留下没主的数据
  await deleteParty(row.role, row.id);
  ElMessage.success("已删除");
  load();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">新增往来单位</el-button>
      <el-radio-group v-model="roleFilter">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="toy_factory">玩具厂</el-radio-button>
        <el-radio-button value="oem_factory">代工厂</el-radio-button>
        <el-radio-button value="me">我</el-radio-button>
      </el-radio-group>
      <span class="hint">我在玩具厂和代工厂之间：点"我"看所有货的入库/出库总账，点某个单位看它自己的出入库</span>
    </div>

    <el-table v-loading="loading" :data="filtered" stripe @row-click="openDetail" class="party-table">
      <el-table-column label="类型" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="roleTagType(row.role)" effect="plain" size="small">
            {{ PARTY_ROLE_LABEL[row.role as PartyRole] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="160">
        <template #default="{ row }">
          <strong>{{ row.name }}</strong>
        </template>
      </el-table-column>
      <el-table-column prop="contact" label="联系人" width="110" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="address" label="地址" min-width="140" show-overflow-tooltip />
      <el-table-column label="产品数量" width="90" align="right">
        <template #default="{ row }">{{ row.productCount ?? "-" }}</template>
      </el-table-column>
      <el-table-column label="加工金额" width="120" align="right">
        <template #default="{ row }">
          {{ row.processedAmount === undefined ? "-" : `¥${row.processedAmount.toFixed(2)}` }}
        </template>
      </el-table-column>
      <el-table-column label="入库" width="80" align="right">
        <template #default="{ row }">{{ row.inCount }} 笔</template>
      </el-table-column>
      <el-table-column label="出库" width="80" align="right">
        <template #default="{ row }">{{ row.outCount }} 笔</template>
      </el-table-column>
      <el-table-column label="最近往来" width="115">
        <template #default="{ row }">{{ row.lastDate ? dayjs(row.lastDate).format("YYYY-MM-DD") : "-" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="openDetail(row)">详情</el-button>
          <template v-if="row.role !== 'me'">
            <el-button link type="primary" @click.stop="openEdit(row)">编辑</el-button>
            <el-button link type="danger" @click.stop="handleDelete(row)">删除</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增往来单位' : `编辑${PARTY_ROLE_LABEL[form.role]}`"
      width="480px"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="类型">
          <!-- 编辑时不能改类型：玩具厂和代工厂在数据库里是两张表，单据都挂在原来那张表的 id 上 -->
          <el-radio-group v-model="form.role" :disabled="dialogMode === 'edit'">
            <el-radio-button value="toy_factory">玩具厂</el-radio-button>
            <el-radio-button value="oem_factory">代工厂</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="名称" prop="name">
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
        <el-button type="primary" :loading="saving" @click="handleSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.hint {
  color: #909399;
  font-size: 13px;
}

.party-table :deep(.el-table__row) {
  cursor: pointer;
}
</style>
