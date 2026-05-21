<script>
  /** @type {{
    element: import('../lib/types').SceneElement | null,
    onUpdate: (id: string, patch: Partial<import('../lib/types').SceneElement>) => void,
    onDelete: (id: string) => void,
  }} */
  let { element, onUpdate, onDelete } = $props();
</script>

<aside class="props">
  <h2>Properties</h2>
  {#if element}
    <label>
      Label
      <input
        type="text"
        value={element.label}
        oninput={(e) => onUpdate(element.id, { label: e.currentTarget.value })}
      />
    </label>

    {#if element.type === 'text'}
      <label>
        Text
        <textarea
          rows="4"
          value={element.text ?? ''}
          oninput={(e) => onUpdate(element.id, { text: e.currentTarget.value })}
        ></textarea>
      </label>
      <label>
        Font size
        <input
          type="number"
          min="8"
          max="120"
          value={element.fontSize ?? 24}
          oninput={(e) =>
            onUpdate(element.id, { fontSize: Number(e.currentTarget.value) })}
        />
      </label>
      <label>
        Color
        <input
          type="color"
          value={element.color ?? '#ffffff'}
          oninput={(e) => onUpdate(element.id, { color: e.currentTarget.value })}
        />
      </label>
    {/if}

    <label>
      Start (s)
      <input
        type="number"
        min="0"
        step="0.1"
        value={element.start}
        oninput={(e) => onUpdate(element.id, { start: Number(e.currentTarget.value) })}
      />
    </label>
    <label>
      End (s)
      <input
        type="number"
        min="0"
        step="0.1"
        value={element.end}
        oninput={(e) => onUpdate(element.id, { end: Number(e.currentTarget.value) })}
      />
    </label>
    <label>
      Z-index
      <input
        type="number"
        value={element.zIndex}
        oninput={(e) => onUpdate(element.id, { zIndex: Number(e.currentTarget.value) })}
      />
    </label>

    <button type="button" class="danger" onclick={() => onDelete(element.id)}>
      Delete element
    </button>
  {:else}
    <p class="hint">Select an element on the canvas or timeline.</p>
  {/if}
</aside>

<style>
  .props {
    width: 220px;
    flex-shrink: 0;
    padding: 12px;
    border-left: 1px solid var(--border);
    background: var(--panel);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 14px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #aaa;
  }

  textarea {
    resize: vertical;
    min-height: 72px;
  }

  .hint {
    color: #666;
    font-size: 13px;
    margin: 0;
  }
</style>
