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
  { title: "首页", icon: "HomeFilled", children: [{ path: "/dashboard", title: "首页 Dashboard", icon: "Odometer" }] },
  {
    title: "基础资料",
    icon: "Notebook",
    children: [
      { path: "/factory", title: "玩具厂管理", icon: "Shop" },
      { path: "/product", title: "产品管理", icon: "Box" },
    ],
  },
  {
    title: "业务管理",
    icon: "Van",
    children: [
      { path: "/inbound", title: "入库管理", icon: "Van" },
      { path: "/asset", title: "资产盘点", icon: "Suitcase" },
    ],
  },
  { title: "财务管理", icon: "Money", children: [{ path: "/billing", title: "应收账单", icon: "Money" }] },
  {
    title: "代工厂管理",
    icon: "OfficeBuilding",
    children: [
      { path: "/oem-factory", title: "代工厂管理", icon: "OfficeBuilding" },
      { path: "/common-material", title: "通用物料", icon: "Goods" },
      { path: "/material-issuance", title: "物料发放", icon: "Promotion" },
      { path: "/oem-receipt", title: "成品回收", icon: "RefreshLeft" },
      { path: "/common-material-return", title: "通用物料回收", icon: "RefreshLeft" },
      { path: "/oem-reconciliation", title: "物料对账", icon: "DataAnalysis" },
    ],
  },
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

// 头部面包屑用的当前页标题+图标，跟侧边栏选中的是同一个菜单项——不用再单独维护一份映射
const currentMenuItem = computed(() => {
  for (const group of menuItems) {
    const found = group.children.find((c) => c.path === activeMenu.value);
    if (found) return found;
  }
  return null;
});

const avatarLetter = computed(() => userStore.username?.[0]?.toUpperCase() ?? "用");

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

function handleUserCommand(command: string) {
  if (command === "logout") handleLogout();
}
</script>

<template>
  <el-container style="height: 100vh">
    <!-- 手机上侧边栏展开时，背后盖一层半透明遮罩，点遮罩收起侧边栏（跟大多数手机 App 的抽屉菜单一个意思） -->
    <div v-if="sidebarOpen" class="sidebar-backdrop" @click="sidebarOpen = false" />

    <el-aside width="200px" class="sidebar" :class="{ 'sidebar-open': sidebarOpen }">
      <div class="logo">
        <div class="logo-icon"><el-icon :size="18"><Box /></el-icon></div>
        <span class="logo-text">玩具加工管理</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        background-color="#fff"
        text-color="#606266"
        active-text-color="#409eff"
        router
        @select="sidebarOpen = false"
      >
        <el-sub-menu v-for="group in menuItems" :key="group.title" :index="group.title">
          <template #title>
            <el-icon><component :is="group.icon" /></el-icon>
            <span>{{ group.title }}</span>
          </template>
          <el-menu-item v-for="item in group.children" :key="item.path" :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <!-- 汉堡按钮只在窄屏出现（CSS 媒体查询控制），桌面端不占地方 -->
          <el-icon class="hamburger" @click="sidebarOpen = !sidebarOpen"><Menu /></el-icon>
          <div class="page-title">
            <el-icon v-if="currentMenuItem"><component :is="currentMenuItem.icon" /></el-icon>
            <span>{{ currentMenuItem?.title ?? "玩具加工管理系统" }}</span>
          </div>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click" @command="handleUserCommand">
            <div class="user-trigger">
              <div class="user-avatar">{{ avatarLetter }}</div>
              <span class="user-name">{{ userStore.username }}</span>
              <el-icon class="user-caret"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">
                  <el-icon><SwitchButton /></el-icon>
                  退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
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
.sidebar {
  background: #fff;
  border-right: 1px solid #eceef1;
}

.logo {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid #f2f3f5;
}

.logo-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, #409eff, #7b6ee6);
}

.logo-text {
  font-size: 15px;
  font-weight: 700;
  color: #303133;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 菜单整体去掉 Element 默认的右边框（sidebar 自己已经有一条），项目圆角+留白，
   选中项用淡蓝色底色而不是纯色块，风格上跟首页那些渐变卡片呼应但更收敛 */
.sidebar :deep(.el-menu) {
  border-right: none;
  padding: 8px;
}

.sidebar :deep(.el-menu-item),
.sidebar :deep(.el-sub-menu__title) {
  border-radius: 8px;
  margin-bottom: 2px;
  height: 44px;
  line-height: 44px;
}

.sidebar :deep(.el-menu-item:hover),
.sidebar :deep(.el-sub-menu__title:hover) {
  background-color: #f5f7fa !important;
}

.sidebar :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.12), rgba(123, 110, 230, 0.1));
  font-weight: 600;
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
  gap: 12px;
  min-width: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
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

.user-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 8px;
  cursor: pointer;
}

.user-trigger:hover {
  background: #f5f7fa;
}

.user-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #409eff, #79bbff);
}

.user-name {
  font-size: 13px;
  color: #303133;
}

.user-caret {
  font-size: 12px;
  color: #909399;
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

.tabs-bar :deep(.el-tabs__item) {
  border-radius: 8px 8px 0 0;
}

.main {
  padding: 16px;
  overflow: auto;
  background: #f0f2f5;
}

/* 窄屏（手机）：侧边栏平时挪到屏幕外，点汉堡按钮才滑进来盖在内容上面，
   不再跟内容区各占一半宽度——这是原来手机上最大的问题。宽度这里强制写死 200px，
   不受桌面端任何折叠状态影响（本页目前没有折叠功能，写死是保险，以后加了也不会漏改这里）。 */
@media (max-width: 768px) {
  .hamburger {
    display: block;
  }

  .page-title {
    font-size: 14px;
  }

  .sidebar {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: 1001;
    width: 200px !important;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
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

  .user-name {
    display: none;
  }

  .main {
    padding: 12px;
  }
}
</style>
