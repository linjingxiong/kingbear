import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { useUserStore } from "../store/user";

const routes: RouteRecordRaw[] = [
  {
    path: "/login",
    name: "login",
    component: () => import("../views/login/LoginView.vue"),
    meta: { public: true },
  },
  {
    path: "/",
    component: () => import("../layouts/BasicLayout.vue"),
    redirect: "/dashboard",
    children: [
      {
        path: "dashboard",
        name: "dashboard",
        component: () => import("../views/dashboard/DashboardView.vue"),
        meta: { title: "首页" },
      },
      // 玩具厂管理/代工厂管理已经合并进往来单位；老路径留着跳转，旧书签和已打开的标签页不会白屏
      { path: "factory", redirect: "/party" },
      {
        path: "product",
        name: "product",
        component: () => import("../views/product/ProductListView.vue"),
        meta: { title: "产品管理" },
      },
      {
        path: "inbound",
        name: "inbound",
        component: () => import("../views/inbound/InboundHubView.vue"),
        meta: { title: "出入库管理" },
      },
      {
        path: "inbound/:id/confirm",
        name: "inbound-confirm",
        component: () => import("../views/inbound/InboundConfirmView.vue"),
        meta: { title: "入库确认" },
      },
      {
        path: "billing",
        name: "billing",
        component: () => import("../views/billing/BillingView.vue"),
        meta: { title: "应收账单" },
      },
      {
        path: "asset",
        name: "asset",
        component: () => import("../views/asset/AssetListView.vue"),
        meta: { title: "资产盘点" },
      },
      { path: "oem-factory", redirect: "/party" },
      {
        path: "common-material",
        name: "common-material",
        component: () => import("../views/common-material/CommonMaterialListView.vue"),
        meta: { title: "通用物料" },
      },
      {
        path: "material-flow",
        name: "material-flow",
        component: () => import("../views/material-flow/MaterialFlowHubView.vue"),
        meta: { title: "物料流转" },
      },
      {
        path: "party",
        name: "party",
        component: () => import("../views/party/PartyListView.vue"),
        meta: { title: "往来单位" },
      },
      {
        // role = toy_factory | oem_factory，见 packages/shared/src/party.ts
        path: "party/:role/:id",
        name: "party-detail",
        component: () => import("../views/party/PartyDetailView.vue"),
        meta: { title: "往来单位详情" },
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const userStore = useUserStore();
  if (!to.meta.public && !userStore.isLoggedIn) {
    return { path: "/login", query: { redirect: to.fullPath } };
  }
  if (to.path === "/login" && userStore.isLoggedIn) {
    return { path: "/dashboard" };
  }
  return true;
});

export default router;
