import { computed, ref } from "vue";

/**
 * 滚轮缩放 + 拖拽平移，跟入库确认页（InboundConfirmView）单据图片那套交互一样。
 * 用在弹窗里预览发料单/回收单这类识别底稿图片，方便看清手写的小字。
 *
 * 用法：容器 div 上绑 @wheel.prevent="onWheel" @mousedown="onMouseDown" @click="onClick"，
 * 内部 <img> 绑 :style="style"，容器 class 按 zoomLevel > 1 / isDragging 切换光标样式。
 */
export function useImageZoomPan(maxZoom = 4) {
  const zoomLevel = ref(1);
  const panX = ref(0);
  const panY = ref(0);
  const isDragging = ref(false);
  let dragStartX = 0;
  let dragStartY = 0;
  let panStartX = 0;
  let panStartY = 0;
  let dragMoved = false;

  function reset() {
    zoomLevel.value = 1;
    panX.value = 0;
    panY.value = 0;
  }

  function onWheel(e: WheelEvent) {
    const step = e.deltaY < 0 ? 0.2 : -0.2;
    zoomLevel.value = Math.min(maxZoom, Math.max(1, zoomLevel.value + step));
    if (zoomLevel.value === 1) {
      panX.value = 0;
      panY.value = 0;
    }
  }

  function onMouseMove(e: MouseEvent) {
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
    panX.value = panStartX + dx;
    panY.value = panStartY + dy;
  }

  function onMouseUp() {
    isDragging.value = false;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  function onMouseDown(e: MouseEvent) {
    if (zoomLevel.value <= 1) return;
    isDragging.value = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    panStartX = panX.value;
    panStartY = panY.value;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  /** 放大状态下点一下（没有拖拽平移）就缩回 1 倍 */
  function onClick() {
    if (dragMoved) {
      dragMoved = false;
      return;
    }
    if (zoomLevel.value > 1) reset();
  }

  const style = computed(() => ({
    transform: `translate(${panX.value}px, ${panY.value}px) scale(${zoomLevel.value})`,
  }));

  return { zoomLevel, isDragging, style, reset, onWheel, onMouseDown, onClick };
}
