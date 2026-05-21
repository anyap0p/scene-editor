<script>
  import { onMount, onDestroy } from 'svelte';
  import Canvas from './components/Canvas.svelte';
  import { PREVIEW_CHANNEL } from './lib/previewSync';
  import { formatTime } from './lib/time';

  /** @type {import('./lib/types').SceneElement[]} */
  let elements = $state([]);
  let currentTime = $state(0);
  let selectedId = $state(null);
  let canvasWidth = $state(800);
  let canvasHeight = $state(600);
  let isPlaying = $state(false);
  let connected = $state(false);

  /** @type {BroadcastChannel | null} */
  let channel = null;

  function post(msg) {
    channel?.postMessage(msg);
  }

  function applySync(msg) {
    elements = msg.elements;
    currentTime = msg.currentTime;
    selectedId = msg.selectedId;
    canvasWidth = msg.canvasWidth;
    canvasHeight = msg.canvasHeight;
    isPlaying = msg.isPlaying;
    connected = true;
  }

  onMount(() => {
    channel = new BroadcastChannel(PREVIEW_CHANNEL);
    channel.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === 'sync') applySync(msg);
    };
    post({ type: 'ready' });
    document.title = 'Scene Preview';
  });

  onDestroy(() => {
    channel?.close();
  });

  function onSelect(id) {
    selectedId = id;
    post({ type: 'select', id });
  }

  function onUpdate(id, patch) {
    elements = elements.map((el) => (el.id === id ? { ...el, ...patch } : el));
    post({ type: 'update', id, patch });
  }
</script>

<div class="popout-app">
  <header class="popout-bar">
    <span class="title">Scene preview</span>
    <span class="time">{formatTime(currentTime)}</span>
    {#if !connected}
      <span class="waiting">Waiting for editor…</span>
    {/if}
  </header>
  <main class="popout-stage">
    <Canvas
      {elements}
      {currentTime}
      {selectedId}
      width={canvasWidth}
      height={canvasHeight}
      onSelect={onSelect}
      onUpdate={onUpdate}
    />
  </main>
</div>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
  }

  .popout-app {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #0a0a0a;
  }

  .popout-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .title {
    font-weight: 600;
  }

  .time {
    font-variant-numeric: tabular-nums;
    color: #aaa;
  }

  .waiting {
    margin-left: auto;
    font-size: 12px;
    color: #888;
  }

  .popout-stage {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: auto;
    padding: 16px;
  }
</style>
