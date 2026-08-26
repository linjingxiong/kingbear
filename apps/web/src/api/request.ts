import axios from "axios";
import { ElMessage } from "element-plus";
import router from "../router";
import { useUserStore } from "../store/user";

const request = axios.create({
  baseURL: "/api",
  timeout: 15000,
});

request.interceptors.request.use((config) => {
  const userStore = useUserStore();
  if (userStore.token) {
    config.headers.Authorization = `Bearer ${userStore.token}`;
  }
  return config;
});

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error.response?.status;
    const message = error.response?.data?.message ?? error.message ?? "请求失败";

    if (status === 401) {
      const userStore = useUserStore();
      userStore.logout();
      router.push("/login");
    }

    // 疑似重复数据（409，带 duplicateType）交给调用方弹确认框处理，这里不重复弹一次报错提示
    if (!error.response?.data?.duplicateType) {
      ElMessage.error(Array.isArray(message) ? message.join("；") : message);
    }
    return Promise.reject(error);
  },
);

export default request;
