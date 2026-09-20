<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import dayjs from "dayjs";
import type { PartyListItem, PartyRole } from "@kingbear/shared";
import { listParties } from "../../api/party";
import { PARTY_ROLE_LABEL, directionLabel } from "./party-labels";

// 往来单位：我打交道的对象——上游的玩具厂、下游的代工厂（以后还有工人/加工代理）放在一个列表里，
// 点进去是统一的详情页。这里只是统一的"看"，玩具厂管理/代工厂管理那两个页面还是各自维护基础资料
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

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <el-radio-group v-model="roleFilter">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="toy_factory">玩具厂</el-radio-button>
        <el-radio-button value="oem_factory">代工厂</el-radio-button>
        <el-radio-button value="me">我</el-radio-button>
      </el-radio-group>
      <span class="hint">我在玩具厂和代工厂之间：点"我"看所有货的收进/发出总账，点某个单位看它自己的出入库</span>
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
      <el-table-column prop="contact" label="联系人" width="120" />
      <el-table-column prop="phone" label="电话" width="140" />
      <el-table-column label="入库 / 收进" width="110" align="right">
        <template #default="{ row }">{{ directionLabel(row.role, "in") }} {{ row.inCount }} 笔</template>
      </el-table-column>
      <el-table-column label="出库 / 发出" width="110" align="right">
        <template #default="{ row }">{{ directionLabel(row.role, "out") }} {{ row.outCount }} 笔</template>
      </el-table-column>
      <el-table-column label="最近往来" width="130">
        <template #default="{ row }">{{ row.lastDate ? dayjs(row.lastDate).format("YYYY-MM-DD") : "-" }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click.stop="openDetail(row)">查看详情</el-button>
        </template>
      </el-table-column>
    </el-table>
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
