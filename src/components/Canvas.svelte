<script>
  import { resolveFontFamily } from '../lib/fonts';
  import { isGifSrc, scaledLocalTime } from '../lib/media';
  import {
    cropMediaOffsetStyle,
    cropViewportStyle,
  } from '../lib/crop';
  import GifCanvas from './GifCanvas.svelte';
  import CropEditOverlay from './CropEditOverlay.svelte';

  /** @type {{
    elements: import('../lib/types').SceneElement[],
    currentTime: number,
    selectedId: string | null,
    width: number,
    height: number,
    cropEditingId: string | null,
    cropEditDraft: import('../lib/crop').ElementCrop | null,
    onSelect: (id: string | null) => void,
    onUpdate: (id: string, patch: Partial<import('../lib/types').SceneElement>, opts?: { skipHistory?: boolean }) => void,
    onCropDraftChange: (crop: import('../lib/crop').ElementCrop) => void,
    onCropDraftCommit?: (crop: import('../lib/crop').ElementCrop) => void,
    onConfirmCropEdit?: () => void,
    onCancelCropEdit?: () => void,
    onGestureStart?: () => void,
    onGestureEnd?: () => void,
    scale?: number,
  }} */
  let {
    elements,
    currentTime,
    selectedId,
    width,
    height,
    cropEditingId = null,
    cropEditDraft = null,
    onCropDraftChange = () => {},
    onCropDraftCommit,
    onConfirmCropEdit,
    onCancelCropEdit,
    onSelect,
    onUpdate,
    onGestureStart,
    onGestureEnd,
    scale = 1,
  } = $props();

  function isElementShown(el) {
    return visible(el) || cropEditingId === el.id;
  }

  /** @type {null | {
    id: string,
    mode: 'move' | 'resize' | 'rotate',
    startX: number,
    startY: number,
    origX: number,
    origY: number,
    origW: number,
    origH: number,
    origRotation: number,
    startAngle: number,
    liveX?: number,
    liveY?: number,
    liveW?: number,
    liveH?: number,
    liveRotation?: number,
  }} */
  let drag = $state(null);

  function visible(el) {
    return currentTime >= el.start && currentTime < el.end;
  }

  function sorted() {
    return [...elements].sort((a, b) => a.zIndex - b.zIndex);
  }

  function onCanvasDown(e) {
    if (cropEditingId) return;
    if (e.target === e.currentTarget) onSelect(null);
  }

  function elementGeometry(el) {
    if (drag?.id !== el.id) {
      return {
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        rotation: el.rotation ?? 0,
      };
    }

    return {
      x: drag.liveX ?? el.x,
      y: drag.liveY ?? el.y,
      width: drag.liveW ?? el.width,
      height: drag.liveH ?? el.height,
      rotation: drag.liveRotation ?? el.rotation ?? 0,
    };
  }

  function elementCenter(el) {
    const geo = elementGeometry(el);
    return { x: geo.x + geo.width / 2, y: geo.y + geo.height / 2 };
  }

  function pointerAngle(el, clientX, clientY) {
    const c = elementCenter(el);
    return (Math.atan2(clientY - c.y, clientX - c.x) * 180) / Math.PI;
  }

  function elementStyle(el) {
    const geo = elementGeometry(el);
    const isDragging = drag?.id === el.id;
    let s = `left: ${geo.x}px; top: ${geo.y}px; width: ${geo.width}px; height: ${geo.height}px; z-index: ${isDragging ? 10000 : el.zIndex};`;
    if (geo.rotation) {
      s += ` transform: rotate(${geo.rotation}deg); transform-origin: center center;`;
    }
    if (isDragging) s += ' will-change: left, top, width, height, transform;';
    if (el.type === 'text') {
      const family = resolveFontFamily(el.fontFamily).replace(/"/g, "'");
      s += ` font-family: ${family}; font-size: ${el.fontSize || 24}px; color: ${el.color || '#fff'}; font-weight: ${el.fontWeight || 'normal'};`;
    }
    return s;
  }

  function activeCrop(el) {
    if (isCropEditing(el)) return null;
    return el.crop ?? null;
  }

  function isCropEditing(el) {
    return cropEditingId === el.id;
  }

  function startDrag(e, el, mode) {
    if (cropEditingId) {
      e.stopPropagation();
      return;
    }
    if (isCropEditing(el)) return;
    e.preventDefault();
    e.stopPropagation();
    onGestureStart?.();
    onSelect(el.id);
    drag = {
      id: el.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
      origRotation: el.rotation ?? 0,
      startAngle: 0,
    };
  }

  function startRotate(e, el) {
    e.preventDefault();
    e.stopPropagation();
    onGestureStart?.();
    onSelect(el.id);
    drag = {
      id: el.id,
      mode: 'rotate',
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.width,
      origH: el.height,
      origRotation: el.rotation ?? 0,
      startAngle: pointerAngle(el, e.clientX, e.clientY),
    };
  }

  function onWindowMove(e) {
    if (!drag) return;
    const el = elements.find((x) => x.id === drag.id);
    if (!el) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (drag.mode === 'move') {
      drag = {
        ...drag,
        liveX: Math.round(drag.origX + dx),
        liveY: Math.round(drag.origY + dy),
      };
    } else if (drag.mode === 'resize') {
      drag = {
        ...drag,
        liveW: Math.max(40, Math.round(drag.origW + dx)),
        liveH: Math.max(24, Math.round(drag.origH + dy)),
      };
    } else if (drag.mode === 'rotate') {
      const angle = pointerAngle(el, e.clientX, e.clientY);
      const delta = angle - drag.startAngle;
      drag = {
        ...drag,
        liveRotation: Math.round(drag.origRotation + delta),
      };
    }
  }

  function commitDrag() {
    if (!drag) return;

    if (drag.mode === 'move' && drag.liveX != null && drag.liveY != null) {
      onUpdate(drag.id, { x: drag.liveX, y: drag.liveY }, { skipHistory: true });
    } else if (drag.mode === 'resize' && drag.liveW != null && drag.liveH != null) {
      onUpdate(
        drag.id,
        { width: drag.liveW, height: drag.liveH },
        { skipHistory: true },
      );
    } else if (drag.mode === 'rotate' && drag.liveRotation != null) {
      onUpdate(drag.id, { rotation: drag.liveRotation }, { skipHistory: true });
    }
  }

  function onWindowUp() {
    if (!drag) return;
    commitDrag();
    onGestureEnd?.();
    drag = null;
  }

  /** @param {HTMLVideoElement} node */
  function syncVideo(node, params) {
    function update() {
      const visible =
        params.currentTime >= params.start && params.currentTime < params.end;
      if (!visible) {
        node.pause();
        return;
      }
      const local = scaledLocalTime(params.currentTime, params.start, params.speed);
      if (Math.abs(node.currentTime - local) > 0.05) node.currentTime = local;
      node.play().catch(() => {});
    }
    update();
    return { update };
  }
</script>

<svelte:window onmousemove={onWindowMove} onmouseup={onWindowUp} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="canvas"
  class:is-dragging={!!drag}
  class:crop-editing-mode={!!cropEditingId}
  style="width: {width}px; height: {height}px;"
  onclick={onCanvasDown}
  onkeydown={() => {}}
  role="application"
  aria-label="Scene canvas"
>
  {#each sorted() as el (el.id)}
    {@const geo = elementGeometry(el)}
    {@const crop = activeCrop(el)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="el"
      class:visible={isElementShown(el)}
      class:selected={selectedId === el.id}
      class:dragging={drag?.id === el.id}
      class:is-text={el.type === 'text'}
      class:is-crop-editing={isCropEditing(el)}
      style={elementStyle(el)}
      onmousedown={(e) => startDrag(e, el, 'move')}
    >
      {#if el.type === 'text'}
        <span class="text-inner">{el.text || ''}</span>
      {:else if el.type === 'image' || el.type === 'video'}
        <div class="media-stage">
          {#if isCropEditing(el) && cropEditDraft}
            <CropEditOverlay
              crop={cropEditDraft}
              width={geo.width}
              height={geo.height}
              {scale}
              maskId="crop-dim-{el.id}"
              onCommit={onCropDraftCommit ?? onCropDraftChange}
              onConfirm={onConfirmCropEdit}
              onCancel={onCancelCropEdit}
              onGestureStart={onGestureStart}
              onGestureEnd={onGestureEnd}
            >
              {#snippet children()}
                {#if el.type === 'image' && el.src && isGifSrc(el.src)}
                  <GifCanvas
                    src={el.src}
                    {currentTime}
                    start={el.start}
                    playbackSpeed={el.playbackSpeed}
                  />
                {:else if el.type === 'image' && el.src}
                  <img src={el.src} alt="" draggable="false" />
                {:else if el.type === 'video' && el.src}
                  <video
                    src={el.src}
                    muted
                    playsinline
                    loop
                    draggable="false"
                    use:syncVideo={{
                      currentTime,
                      start: el.start,
                      end: el.end,
                      speed: el.playbackSpeed,
                    }}
                  ></video>
                {:else}
                  <span class="placeholder">{el.type}</span>
                {/if}
              {/snippet}
            </CropEditOverlay>
          {:else if crop}
            <div class="crop-viewport" style={cropViewportStyle(crop, geo.width, geo.height)}>
              <div class="crop-media" style={cropMediaOffsetStyle(crop, geo.width, geo.height)}>
                {#if el.type === 'image' && el.src && isGifSrc(el.src)}
                  <GifCanvas
                    src={el.src}
                    {currentTime}
                    start={el.start}
                    playbackSpeed={el.playbackSpeed}
                  />
                {:else if el.type === 'image' && el.src}
                  <img src={el.src} alt="" draggable="false" />
                {:else if el.type === 'video' && el.src}
                  <video
                    src={el.src}
                    muted
                    playsinline
                    loop
                    draggable="false"
                    use:syncVideo={{
                      currentTime,
                      start: el.start,
                      end: el.end,
                      speed: el.playbackSpeed,
                    }}
                  ></video>
                {/if}
              </div>
            </div>
          {:else if el.type === 'image' && el.src && isGifSrc(el.src)}
            <GifCanvas
              src={el.src}
              {currentTime}
              start={el.start}
              playbackSpeed={el.playbackSpeed}
            />
          {:else if el.type === 'image' && el.src}
            <img src={el.src} alt="" draggable="false" />
          {:else if el.type === 'video' && el.src}
            <video
              src={el.src}
              muted
              playsinline
              loop
              draggable="false"
              use:syncVideo={{
                currentTime,
                start: el.start,
                end: el.end,
                speed: el.playbackSpeed,
              }}
            ></video>
          {:else}
            <span class="placeholder">{el.type}</span>
          {/if}
        </div>
      {:else}
        <span class="placeholder">{el.type}</span>
      {/if}
      {#if selectedId === el.id && !isCropEditing(el)}
        {#if el.type === 'text'}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="rotate-handle"
            onmousedown={(e) => startRotate(e, el)}
            title="Drag to rotate"
          ></div>
        {/if}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="resize-handle"
          onmousedown={(e) => startDrag(e, el, 'resize')}
        ></div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .canvas {
    position: relative;
    background: #000;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    user-select: none;
  }

  .canvas.crop-editing-mode {
    cursor: default;
  }

  .canvas.crop-editing-mode .el:not(.is-crop-editing) {
    pointer-events: none;
  }

  .canvas.is-dragging {
    cursor: grabbing;
  }

  .canvas.is-dragging .el:not(.dragging) {
    pointer-events: none;
  }

  .el {
    position: absolute;
    cursor: grab;
    border: 2px solid transparent;
    border-radius: 4px;
    overflow: hidden;
    user-select: none;
    display: none;
  }

  .el.visible {
    display: block;
  }

  .el.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .el.dragging {
    cursor: grabbing;
  }

  .el.is-text {
    overflow: visible;
  }

  .el.is-crop-editing {
    cursor: default;
  }

  .media-stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .crop-viewport {
    position: absolute;
    box-sizing: border-box;
  }

  .crop-media {
    position: absolute;
  }

  .text-inner {
    display: block;
    width: 100%;
    height: 100%;
    padding: 8px;
    white-space: pre-wrap;
    line-height: 1.25;
    pointer-events: none;
  }

  .el img,
  .el video,
  .el :global(canvas) {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    pointer-events: none;
  }

  .placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: #222;
    color: #888;
    font-size: 12px;
    text-transform: uppercase;
    pointer-events: none;
  }

  .rotate-handle {
    position: absolute;
    left: 50%;
    top: -22px;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    background: var(--accent);
    border: 2px solid #1a1a1a;
    border-radius: 50%;
    cursor: grab;
    z-index: 2;
  }

  .rotate-handle:active {
    cursor: grabbing;
  }

  .resize-handle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-radius: 3px 0 4px 0;
    cursor: nwse-resize;
    z-index: 2;
  }
</style>
