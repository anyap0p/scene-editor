<script>
  import {
    cropFromRectPx,
    cropRectPx,
    fixedAspectShape,
    squareCropRectPx,
  } from '../lib/crop';

  /** @type {{
    crop: import('../lib/crop').ElementCrop,
    width: number,
    height: number,
    scale?: number,
    onLiveChange: (crop: import('../lib/crop').ElementCrop | null) => void,
    onCommit: (crop: import('../lib/crop').ElementCrop) => void,
    onGestureStart?: () => void,
    onGestureEnd?: () => void,
  }} */
  let {
    crop,
    width,
    height,
    scale = 1,
    onLiveChange,
    onCommit,
    onGestureStart,
    onGestureEnd,
  } = $props();

  /** @type {null | { mode: 'move' | 'resize', handle: string, startX: number, startY: number, orig: import('../lib/crop').ElementCrop, pointerId: number }} */
  let drag = $state(null);

  /** @type {import('../lib/crop').ElementCrop | null} */
  let liveCrop = $state(null);

  let displayCrop = $derived(liveCrop ?? crop);
  let box = $derived(
    fixedAspectShape(displayCrop.shape)
      ? squareCropRectPx(displayCrop, width, height)
      : cropRectPx(displayCrop, width, height),
  );
  let aspectLocked = $derived(fixedAspectShape(displayCrop.shape));

  /** @type {import('../lib/crop').ElementCrop | null} */
  let pendingCrop = null;
  let rafId = 0;

  /** @type {((e: PointerEvent) => void) | null} */
  let boundMove = null;
  /** @type {((e: PointerEvent) => void) | null} */
  let boundUp = null;

  $effect(() => {
    if (drag) return;
    crop;
    liveCrop = null;
  });

  /** @param {import('../lib/crop').ElementCrop} next */
  function preview(next) {
    liveCrop = next;
    onLiveChange(next);
  }

  /** @param {import('../lib/crop').ElementCrop} next */
  function schedulePreview(next) {
    pendingCrop = next;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      if (pendingCrop) preview(pendingCrop);
      pendingCrop = null;
    });
  }

  /** @param {import('../lib/crop').ElementCrop} o @param {{ x: number, y: number, w: number, h: number }} rect */
  function cropFromRect(o, rect) {
    return cropFromRectPx(o, rect, width, height);
  }

  function removeDragListeners() {
    if (boundMove) {
      document.removeEventListener('pointermove', boundMove);
      boundMove = null;
    }
    if (boundUp) {
      document.removeEventListener('pointerup', boundUp);
      document.removeEventListener('pointercancel', boundUp);
      boundUp = null;
    }
  }

  /** @param {PointerEvent} [e] */
  function finishDrag(e) {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    if (!drag) {
      removeDragListeners();
      return;
    }

    if (e && e.pointerId !== drag.pointerId) return;

    const finalCrop = pendingCrop ?? liveCrop ?? crop;
    pendingCrop = null;
    drag = null;
    removeDragListeners();

    onCommit(finalCrop);
    liveCrop = null;
    onLiveChange(null);
    onGestureEnd?.();
  }

  /** @param {PointerEvent} e */
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;

    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const o = drag.orig;
    const oRect = cropRectPx(o, width, height);

    if (drag.mode === 'move') {
      schedulePreview(
        cropFromRect(o, {
          x: oRect.x + dx,
          y: oRect.y + dy,
          w: oRect.w,
          h: oRect.h,
        }),
      );
      return;
    }

    let x = oRect.x;
    let y = oRect.y;
    let w = oRect.w;
    let h = oRect.h;
    const hdl = drag.handle;

    if (hdl.includes('e')) w = oRect.w + dx;
    if (hdl.includes('s')) h = oRect.h + dy;
    if (hdl.includes('w')) {
      w = oRect.w - dx;
      x = oRect.x + dx;
    }
    if (hdl.includes('n')) {
      h = oRect.h - dy;
      y = oRect.y + dy;
    }

    if (aspectLocked) {
      const size = Math.max(24, Math.min(Math.abs(w), Math.abs(h)));
      if (hdl.includes('w')) x = oRect.x + oRect.w - size;
      else x = oRect.x;
      if (hdl.includes('n')) y = oRect.y + oRect.h - size;
      else y = oRect.y;
      w = size;
      h = size;
    } else {
      w = Math.max(24, w);
      h = Math.max(24, h);
    }

    schedulePreview(cropFromRect(o, { x, y, w, h }));
  }

  /** @param {PointerEvent} e */
  function onPointerUp(e) {
    finishDrag(e);
  }

  /** @param {PointerEvent} e @param {'move' | 'resize'} mode @param {string} handle */
  function startPointerDrag(e, mode, handle) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    removeDragListeners();
    onGestureStart?.();

    drag = {
      mode,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...(liveCrop ?? crop) },
      pointerId: e.pointerId,
    };

    boundMove = onPointerMove;
    boundUp = onPointerUp;
    document.addEventListener('pointermove', boundMove);
    document.addEventListener('pointerup', boundUp);
    document.addEventListener('pointercancel', boundUp);
  }

  /** @param {PointerEvent} e */
  function startMove(e) {
    startPointerDrag(e, 'move', 'move');
  }

  /** @param {PointerEvent} e @param {string} handle */
  function startResize(e, handle) {
    startPointerDrag(e, 'resize', handle);
  }
</script>

<svelte:window onblur={() => finishDrag()} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="crop-box"
  class:is-dragging={!!drag}
  style="left: {box.x}px; top: {box.y}px; width: {box.w}px; height: {box.h}px; touch-action: none;"
  onpointerdown={startMove}
>
  {#if aspectLocked}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="handle se" onpointerdown={(e) => startResize(e, 'se')}></div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="handle nw" onpointerdown={(e) => startResize(e, 'nw')}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="handle ne" onpointerdown={(e) => startResize(e, 'ne')}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="handle sw" onpointerdown={(e) => startResize(e, 'sw')}></div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="handle se" onpointerdown={(e) => startResize(e, 'se')}></div>
  {/if}
</div>

<style>
  .crop-box {
    position: absolute;
    box-sizing: border-box;
    border: 2px dashed #fff;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.65);
    cursor: move;
    z-index: 4;
    pointer-events: auto;
    touch-action: none;
  }

  .crop-box.is-dragging {
    cursor: grabbing;
  }

  .handle {
    position: absolute;
    width: 10px;
    height: 10px;
    background: #fff;
    border: 1px solid #111;
    border-radius: 2px;
    z-index: 6;
    touch-action: none;
  }

  .handle.nw {
    left: -5px;
    top: -5px;
    cursor: nwse-resize;
  }

  .handle.ne {
    right: -5px;
    top: -5px;
    cursor: nesw-resize;
  }

  .handle.sw {
    left: -5px;
    bottom: -5px;
    cursor: nesw-resize;
  }

  .handle.se {
    right: -5px;
    bottom: -5px;
    cursor: nwse-resize;
  }
</style>
