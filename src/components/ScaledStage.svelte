<script>
  /** @type {{
    width: number,
    height: number,
    stageScale?: number,
    children: import('svelte').Snippet,
  }} */
  let { width, height, stageScale = $bindable(1), children } = $props();

  let containerEl = $state(null);
  let containerW = $state(0);
  let containerH = $state(0);

  let scale = $derived.by(() => {
    if (!containerW || !containerH || !width || !height) return 1;
    const pad = 24;
    const sx = (containerW - pad) / width;
    const sy = (containerH - pad) / height;
    return Math.min(sx, sy, 1);
  });

  let scaledW = $derived(width * scale);
  let scaledH = $derived(height * scale);

  $effect(() => {
    stageScale = scale;
  });

  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) {
        containerW = cr.width;
        containerH = cr.height;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  });
</script>

<div class="scaled-stage" bind:this={containerEl}>
  <div class="scaled-frame" style="width: {scaledW}px; height: {scaledH}px;">
    <div
      class="scaled-inner"
      style="width: {width}px; height: {height}px; transform: scale({scale});"
    >
      {@render children()}
    </div>
  </div>
</div>

<style>
  .scaled-stage {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .scaled-frame {
    position: relative;
    flex-shrink: 0;
  }

  .scaled-inner {
    transform-origin: top left;
    position: absolute;
    top: 0;
    left: 0;
  }
</style>
