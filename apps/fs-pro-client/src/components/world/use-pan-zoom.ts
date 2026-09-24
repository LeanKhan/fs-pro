import { computed, onBeforeUnmount, onMounted, reactive, ref, type Ref } from 'vue';

/**
 * Pan and zoom for a scene that COVERS its viewport at zoom 1 (like
 * object-fit: cover). One finger/mouse drags, two fingers pinch, the wheel
 * zooms at the cursor. `margin` is how far past the picture you may pan, in
 * scene sizes (1 = one full scene of surround on every side).
 */
export function usePanZoom(viewport: Ref<HTMLElement | null>, width: () => number, height: () => number, margin = 1, maxZoom = 3) {
  const view = reactive({ vw: 0, vh: 0, s: 1, tx: 0, ty: 0 });
  const animate = ref(false);
  let touched = false;

  const ratio = () => width() / height();
  const baseW = computed(() => Math.max(view.vw, view.vh * ratio()));
  const baseH = computed(() => baseW.value / ratio());
  const span = 1 + 2 * margin;
  const minZoom = computed(() => {
    if (!view.vw) return 1;
    return Math.max(margin ? 0.5 : 1, view.vw / (span * baseW.value), view.vh / (span * baseH.value));
  });

  const mapStyle = computed(() => ({
    width: `${baseW.value}px`,
    height: `${baseH.value}px`,
    transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
    '--inv': String(1 / view.s),
  }));

  function clampView(s: number, tx: number, ty: number) {
    const z = Math.min(maxZoom, Math.max(minZoom.value, s));
    const w = baseW.value * z;
    const h = baseH.value * z;
    return {
      s: z,
      tx: Math.min(margin * w, Math.max(view.vw - (1 + margin) * w, tx)),
      ty: Math.min(margin * h, Math.max(view.vh - (1 + margin) * h, ty)),
    };
  }
  function apply(next: { s: number; tx: number; ty: number }) {
    Object.assign(view, next);
  }
  let animTimer: ReturnType<typeof setTimeout> | undefined;
  function animateOnce() {
    animate.value = true;
    clearTimeout(animTimer);
    animTimer = setTimeout(() => (animate.value = false), 260);
  }
  function resetView() {
    animateOnce();
    touched = false;
    apply(clampView(1, (view.vw - baseW.value) / 2, (view.vh - baseH.value) / 2));
  }
  function zoomAt(factor: number, cx: number, cy: number) {
    touched = true;
    const z = Math.min(maxZoom, Math.max(minZoom.value, view.s * factor));
    const k = z / view.s;
    apply(clampView(z, cx - (cx - view.tx) * k, cy - (cy - view.ty) * k));
  }
  function zoomBy(factor: number) {
    animateOnce();
    zoomAt(factor, view.vw / 2, view.vh / 2);
  }
  /** Centre the view on a scene point (scene units). */
  function focus(x: number, y: number, zoom = view.s) {
    animateOnce();
    touched = true;
    const px = (x / width()) * baseW.value * zoom;
    const py = (y / height()) * baseH.value * zoom;
    apply(clampView(zoom, view.vw / 2 - px, view.vh / 2 - py));
  }

  function onWheel(e: WheelEvent) {
    const r = viewport.value!.getBoundingClientRect();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
  }

  // Pointer capture only starts once a drag is real, so taps reach the plots.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false;
  let moved = 0;
  let suppressClick = false;
  let lastPinch = 0;
  const pinchDist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a!.x - b!.x, a!.y - b!.y);
  };
  const pinchMid = () => {
    const [a, b] = [...pointers.values()];
    const r = viewport.value!.getBoundingClientRect();
    return { x: (a!.x + b!.x) / 2 - r.left, y: (a!.y + b!.y) / 2 - r.top };
  };
  function onPointerDown(e: PointerEvent) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) lastPinch = pinchDist();
  }
  function onPointerMove(e: PointerEvent) {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const d = pinchDist();
      if (lastPinch) {
        const m = pinchMid();
        zoomAt(d / lastPinch, m.x, m.y);
      }
      lastPinch = d;
      dragging = true;
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (!dragging && moved > 6) {
      dragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    if (dragging) {
      touched = true;
      apply(clampView(view.s, view.tx + dx, view.ty + dy));
    }
  }
  function onPointerEnd(e: PointerEvent) {
    pointers.delete(e.pointerId);
    lastPinch = 0;
    if (pointers.size === 0 && dragging) {
      dragging = false;
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
  }
  function onClickCapture(e: MouseEvent) {
    if (suppressClick) {
      e.stopPropagation();
      e.preventDefault();
    }
  }

  let observer: ResizeObserver | undefined;
  function measure() {
    const el = viewport.value;
    if (!el) return;
    view.vw = el.clientWidth;
    view.vh = el.clientHeight;
    if (touched) apply(clampView(view.s, view.tx, view.ty));
    else apply(clampView(1, (view.vw - baseW.value) / 2, (view.vh - baseH.value) / 2));
  }
  onMounted(() => {
    measure();
    observer = new ResizeObserver(measure);
    if (viewport.value) observer.observe(viewport.value);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    clearTimeout(animTimer);
  });

  return {
    view,
    animate,
    mapStyle,
    zoomBy,
    resetView,
    focus,
    handlers: { onWheel, onPointerDown, onPointerMove, onPointerEnd, onClickCapture },
  };
}
