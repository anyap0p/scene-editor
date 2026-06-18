<script>
  import {
    cropRectPx,
    HEART_MASK_URL,
    squareCropRectPx,
  } from '../lib/crop';
  import CropHandles from './CropHandles.svelte';

  /** @type {{
    crop: import('../lib/crop').ElementCrop,
    width: number,
    height: number,
    scale?: number,
    maskId: string,
    onCommit: (crop: import('../lib/crop').ElementCrop) => void,
    onConfirm?: () => void,
    onCancel?: () => void,
    onGestureStart?: () => void,
    onGestureEnd?: () => void,
    children: import('svelte').Snippet,
  }} */
  let {
    crop,
    width,
    height,
    scale = 1,
    maskId,
    onCommit,
    onConfirm,
    onCancel,
    onGestureStart,
    onGestureEnd,
    children,
  } = $props();

  /** @type {import('../lib/crop').ElementCrop | null} */
  let liveCrop = $state(null);

  let displayCrop = $derived(liveCrop ?? crop);
  let rect = $derived(cropRectPx(displayCrop, width, height));
  let squareRect = $derived(squareCropRectPx(displayCrop, width, height));

  $effect(() => {
    if (liveCrop) return;
    crop;
    liveCrop = null;
  });

  /** @param {import('../lib/crop').ElementCrop | null} next */
  function handleLiveChange(next) {
    liveCrop = next;
  }

  /** @param {import('../lib/crop').ElementCrop} next */
  function handleCommit(next) {
    liveCrop = null;
    onCommit(next);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="crop-edit-overlay">
  <div class="media-full">
    {@render children()}
  </div>

  <svg class="crop-dim-svg" {width} {height} aria-hidden="true">
    <defs>
      <mask id={maskId}>
        <rect {width} {height} fill="white" />
        {#if displayCrop.shape === 'heart'}
          <image
            href={HEART_MASK_URL}
            x={squareRect.x}
            y={squareRect.y}
            width={squareRect.w}
            height={squareRect.h}
            preserveAspectRatio="xMidYMid meet"
          />
        {:else if displayCrop.shape === 'circle'}
          <circle
            cx={squareRect.x + squareRect.w / 2}
            cy={squareRect.y + squareRect.h / 2}
            r={squareRect.w / 2}
            fill="black"
          />
        {:else}
          <rect
            x={rect.x}
            y={rect.y}
            width={rect.w}
            height={rect.h}
            rx={displayCrop.cornerRadius ?? 0}
            ry={displayCrop.cornerRadius ?? 0}
            fill="black"
          />
        {/if}
      </mask>
    </defs>
    <rect {width} {height} fill="rgba(0, 0, 0, 0.58)" mask="url(#{maskId})" />
  </svg>

  <CropHandles
    {crop}
    {width}
    {height}
    {scale}
    onLiveChange={handleLiveChange}
    onCommit={handleCommit}
    {onGestureStart}
    {onGestureEnd}
  />

  {#if onConfirm && onCancel}
    <div class="crop-edit-bar" role="toolbar" aria-label="Crop actions">
      <button type="button" onclick={onCancel}>Cancel</button>
      <button type="button" class="primary" onclick={onConfirm}>OK</button>
    </div>
  {/if}
</div>

<style>
  .crop-edit-overlay {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .media-full {
    position: absolute;
    inset: 0;
    z-index: 1;
  }

  .crop-dim-svg {
    position: absolute;
    inset: 0;
    z-index: 2;
    pointer-events: none;
  }

  .crop-edit-bar {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    z-index: 7;
    display: flex;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(12, 12, 12, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  .crop-edit-bar button {
    min-width: 72px;
    padding: 6px 12px;
    font-size: 12px;
  }

  .crop-edit-bar button.primary {
    font-weight: 600;
  }
</style>
