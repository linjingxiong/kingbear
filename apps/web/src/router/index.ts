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
      {
        path: "factory",
        name: "factory",
        component: () => import("../views/factory/FactoryListView.vue"),
        meta: { title: "玩具厂管理" },
      },
      {
        path: "product",
        name: "product",
        component: () => import("../views/product/ProductListView.vue"),
        meta: { title: "产品管理" },
      },
      {
        path: "inbound",
        name: "inbound",
        component: () => import("../views/inbound/InboundListView.vue"),
        meta: { title: "入库管理" },
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
      {
        path: "oem-factory",
        name: "oem-factory",
        component: () => import("../views/oem-factory/OemFactoryListView.vue"),
        meta: { title: "代工厂管理" },
      },
      {
        path: "material",
        name: "material",
        component: () => import("../views/material/MaterialListView.vue"),
        meta: { title: "物料管理" },
      },
      {
        path: "material-issuance",
        name: "material-issuance",
        component: () => import("../views/material-issuance/MaterialIssuanceListView.vue"),
        meta: { title: "物料发放" },
      },
      {
        path: "oem-receipt",
        name: "oem-receipt",
        component: () => import("../views/oem-receipt/OemReceiptListView.vue"),
        meta: { title: "成品回收" },
      },
      {
        path: "oem-reconciliation",
        name: "oem-reconciliation",
        component: () => import("../views/oem-reconciliation/OemReconciliationView.vue"),
        meta: { title: "物料对账" },
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
