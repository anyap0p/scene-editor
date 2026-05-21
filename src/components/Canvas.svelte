<script>
  /** @type {{ elements: import('../lib/types').SceneElement[], currentTime: number, selectedId: string | null, width: number, height: number, onSelect: (id: string | null) => void, onUpdate: (id: string, patch: Partial<import('../lib/types').SceneElement>) => void, onGestureStart?: () => void, onGestureEnd?: () => void }} */
  let {
    elements,
    currentTime,
    selectedId,
    width,
    height,
    onSelect,
    onUpdate,
    onGestureStart,
    onGestureEnd,
  } = $props();

  let drag = $state(null);

  function visible(el) {
    return currentTime >= el.start && currentTime < el.end;
  }

  function sorted() {
    return [...elements].sort((a, b) => a.zIndex - b.zIndex);
  }

  function onCanvasDown(e) {
    if (e.target === e.currentTarget) onSelect(null);
  }

  function startDrag(e, el, mode) {
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
    };
  }

  function onWindowMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (drag.mode === 'move') {
      onUpdate(drag.id, {
        x: Math.round(drag.origX + dx),
        y: Math.round(drag.origY + dy),
      });
    } else if (drag.mode === 'resize') {
      onUpdate(drag.id, {
        width: Math.max(40, Math.round(drag.origW + dx)),
        height: Math.max(24, Math.round(drag.origH + dy)),
      });
    }
  }

  function onWindowUp() {
    if (drag) onGestureEnd?.();
    drag = null;
  }
</script>

<svelte:window onmousemove={onWindowMove} onmouseup={onWindowUp} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="canvas"
  style="width: {width}px; height: {height}px;"
  onclick={onCanvasDown}
  onkeydown={() => {}}
  role="application"
  aria-label="Scene canvas"
>
  {#each sorted() as el (el.id)}
    {#if visible(el)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="el"
        class:selected={selectedId === el.id}
        style="left: {el.x}px; top: {el.y}px; width: {el.width}px; height: {el.height}px; z-index: {el.zIndex}; {el.type === 'text' ? `font-size: ${el.fontSize || 24}px; color: ${el.color || '#fff'}; font-weight: ${el.fontWeight || 'normal'};` : ''}"
        onmousedown={(e) => startDrag(e, el, 'move')}
      >
        {#if el.type === 'text'}
          <span class="text-inner">{el.text || ''}</span>
        {:else if el.type === 'image' && el.src}
          <img src={el.src} alt="" draggable="false" />
        {:else if el.type === 'video' && el.src}
          <video src={el.src} muted playsinline loop draggable="false"></video>
        {:else}
          <span class="placeholder">{el.type}</span>
        {/if}
        {#if selectedId === el.id}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="resize-handle"
            onmousedown={(e) => startDrag(e, el, 'resize')}
          ></div>
        {/if}
      </div>
    {/if}
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
  }

  .el {
    position: absolute;
    cursor: grab;
    border: 2px solid transparent;
    border-radius: 4px;
    overflow: hidden;
  }

  .el.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .el:active {
    cursor: grabbing;
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
  .el video {
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

  .resize-handle {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-radius: 3px 0 4px 0;
    cursor: nwse-resize;
  }
</style>
