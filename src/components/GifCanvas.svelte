<script>
  import { tick } from 'svelte';
  import { loadGifRenderer } from '../lib/gifPlayback';

  /** @type {{
    src: string,
    currentTime: number,
    start: number,
    playbackSpeed?: number,
  }} */
  let { src, currentTime, start, playbackSpeed } = $props();

  let canvas = $state(null);
  /** @type {import('../lib/gifPlayback').GifRenderer | null} */
  let renderer = $state(null);
  let failed = $state(false);
  let loadToken = 0;

  $effect(() => {
    const token = ++loadToken;
    failed = false;
    renderer = null;

    loadGifRenderer(src).then(async (next) => {
      if (token !== loadToken) return;
      renderer = next;
      failed = !next;
      await tick();
      paint(true);
    });
  });

  $effect(() => {
    currentTime;
    start;
    playbackSpeed;
    renderer;
    canvas;
    paint(false);
  });

  /** @param {boolean} force */
  function paint(force) {
    if (!canvas || !renderer) return;
    canvas.width = renderer.width;
    canvas.height = renderer.height;
    if (force) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderer.renderAndDrawTo(
        ctx,
        canvas.width,
        canvas.height,
        currentTime,
        start,
        playbackSpeed,
      );
      return;
    }
    renderer.renderAtSceneTime(currentTime, start, playbackSpeed);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderer.drawTo(ctx, canvas.width, canvas.height);
  }
</script>

<div class="gif-wrap">
  {#if failed}
    <img class="fallback" {src} alt="" />
  {:else}
    <img class="fallback" class:loaded={!!renderer} {src} alt="" />
    <canvas bind:this={canvas} class:ready={!!renderer}></canvas>
  {/if}
</div>

<style>
  .gif-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .fallback,
  canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
    pointer-events: none;
  }

  canvas {
    position: absolute;
    inset: 0;
    opacity: 0;
  }

  canvas.ready {
    opacity: 1;
  }

  .fallback.loaded {
    visibility: hidden;
  }
</style>
