<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { TabPaneName, TabsPaneContext } from "element-plus";
import { useUserStore } from "../store/user";
import { useTabsStore } from "../store/tabs";

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tabsStore = useTabsStore();

// 手机上侧边栏平时收起来，点汉堡按钮才滑出来盖在内容上面（见下面 CSS 的 @media 部分）；
// 桌面端这个开关完全不生效，侧边栏一直显示，不受影响
const sidebarOpen = ref(false);

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
  sidebarOpen.value = false;
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
    <!-- 手机上侧边栏展开时，背后盖一层半透明遮罩，点遮罩收起侧边栏（跟大多数手机 App 的抽屉菜单一个意思） -->
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />

    <el-aside width="200px" class="sidebar" :class="{ 'sidebar-open': sidebarOpen }" style="background: #001529">
      <div class="logo">玩具加工管理系统</div>
      <el-menu
        :default-active="activeMenu"
        background-color="#001529"
        text-color="#c9d1d9"
        active-text-color="#fff"
        router
        @select="sidebarOpen = false"
      >
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
        <div class="header-left">
          <!-- 汉堡按钮只在窄屏出现（CSS 媒体查询控制），桌面端不占地方 -->
          <el-icon class="hamburger" @click="sidebarOpen = !sidebarOpen"><Menu /></el-icon>
          <span class="header-title">玩具加工管理系统</span>
        </div>
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

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

/* 汉堡按钮默认隐藏，只在下面窄屏的媒体查询里放出来——桌面端侧边栏本来就一直显示，不需要它 */
.hamburger {
  display: none;
  font-size: 20px;
  cursor: pointer;
  flex-shrink: 0;
}

.sidebar-backdrop {
  display: none;
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

/* 窄屏（手机）：侧边栏平时挪到屏幕外，点汉堡按钮才滑进来盖在内容上面，
   不再跟内容区各占一半宽度——这是原来手机上最大的问题 */
@media (max-width: 768px) {
  .hamburger {
    display: block;
  }

  .header-title {
    font-size: 14px;
  }

  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 1001;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.2);
  }

  .sidebar.sidebar-open {
    transform: translateX(0);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 1000;
  }

  .main {
    padding: 12px;
  }
}
</style>
