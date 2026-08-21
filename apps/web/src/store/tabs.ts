import { defineStore } from "pinia";

export interface TabItem {
  path: string;
  title: string;
}

export const useTabsStore = defineStore("tabs", {
  state: () => ({
    tabs: [] as TabItem[],
    activePath: "",
  }),
  actions: {
    open(tab: TabItem) {
      if (!this.tabs.some((t) => t.path === tab.path)) {
        this.tabs.push(tab);
      }
      this.activePath = tab.path;
    },
    close(path: string) {
      const idx = this.tabs.findIndex((t) => t.path === path);
      if (idx === -1) return null;
      this.tabs.splice(idx, 1);
      if (this.activePath === path) {
        const next = this.tabs[idx] ?? this.tabs[idx - 1];
        this.activePath = next?.path ?? "";
        return next?.path ?? null;
      }
      return null;
    },
  },
});
