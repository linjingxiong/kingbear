<script setup lang="ts">
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TabPaneName, TabsPaneContext } from "element-plus";
import { useUserStore } from "../store/user";
import { useTabsStore } from "../store/tabs";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tabsStore = useTabsStore();

const menuItems = [
  { title: "首页", children: [{ path: "/dashboard", title: "首页 Dashboard" }] },
  {
    title: "基础资料",
    children: [
      { path: "/factory", title: "玩具厂管理" },
      { path: "/product", title: "产品管理" },
    ],
  },
  { title: "业务管理", children: [{ path: "/inbound", title: "入库管理" }] },
  { title: "财务管理", children: [{ path: "/billing", title: "应收账单" }] },
];

watch(
  () => route.fullPath,
  () => {
    if (!route.meta.title) return;
    tabsStore.open({ path: route.path, title: route.meta.title as string });
  },
  { immediate: true },
);

const activeMenu = computed(() => `/${route.path.split("/")[1] ?? "dashboard"}`);

function handleTabClick(path: string) {
  router.push(path);
}

function handleTabRemove(path: string) {
  const fallback = tabsStore.close(path);
  if (fallback) router.push(fallback);
}

function handleLogout() {
  userStore.logout();
  router.push("/login");
}
</script>

<template>
  <el-container style="height: 100vh">
    <el-aside width="200px" style="background: #001529">
      <div class="logo">玩具加工管理系统</div>
      <el-menu :default-active="activeMenu" background-color="#001529" text-color="#c9d1d9" active-text-color="#fff" router>
        <el-sub-menu v-for="group in menuItems" :key="group.title" :index="group.title">
          <template #title>{{ group.title }}</template>
          <el-menu-item v-for="item in group.children" :key="item.path" :index="item.path">
            {{ item.title }}
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span class="header-title">玩具加工管理系统</span>
        <div class="header-right">
          <span>{{ userStore.username }}</span>
          <el-button link @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <div class="tabs-bar">
        <el-tabs
          :model-value="tabsStore.activePath"
          type="card"
          closable
          @tab-click="(pane: TabsPaneContext) => handleTabClick(pane.paneName as string)"
          @tab-remove="(name: TabPaneName) => handleTabRemove(name as string)"
        >
          <el-tab-pane v-for="tab in tabsStore.tabs" :key="tab.path" :label="tab.title" :name="tab.path" />
        </el-tabs>
      </div>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.logo {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tabs-bar {
  padding: 6px 12px 0;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
}

.main {
  padding: 16px;
  overflow: auto;
}
</style>
