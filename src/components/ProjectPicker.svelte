<script>
  /** @type {{
    projects: import('../lib/db').StoredProjectMeta[],
    activeId: string | null,
    saveStatus: 'idle' | 'saving' | 'saved' | 'error',
    onSelect: (id: string) => void,
    onNew: () => void,
    onDelete: () => void,
  }} */
  let { projects, activeId, saveStatus, onSelect, onNew, onDelete } = $props();

  function formatWhen(ts) {
    const d = new Date(ts);
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString();
  }

  let saveLabel = $derived(
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
        ? 'Saved'
        : saveStatus === 'error'
          ? 'Save failed'
          : '',
  );
</script>

<div class="project-picker">
  <label class="picker-label">
    <span class="sr-only">Project</span>
    <select
      value={activeId ?? ''}
      onchange={(e) => {
        const id = e.currentTarget.value;
        if (id) onSelect(id);
      }}
      disabled={projects.length === 0}
    >
      {#each projects as p (p.id)}
        <option value={p.id}>{p.name}</option>
      {/each}
    </select>
  </label>

  <button type="button" onclick={onNew} title="New project">+ New</button>

  <button
    type="button"
    class="danger"
    onclick={onDelete}
    disabled={projects.length <= 1}
    title={projects.length <= 1 ? 'Cannot delete the only project' : 'Delete project'}
  >
    Delete
  </button>

  {#if saveLabel}
    <span class="save-status" class:error={saveStatus === 'error'}>{saveLabel}</span>
  {/if}

  {#if activeId}
    {@const meta = projects.find((p) => p.id === activeId)}
    {#if meta}
      <span class="updated" title="Last saved">{formatWhen(meta.updatedAt)}</span>
    {/if}
  {/if}
</div>

<style>
  .project-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .picker-label select {
    min-width: 140px;
    max-width: 200px;
    padding: 6px 8px;
    background: #252525;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: inherit;
    font-weight: 600;
  }

  .save-status {
    font-size: 11px;
    color: #6a6;
    white-space: nowrap;
  }

  .save-status.error {
    color: var(--danger);
  }

  .updated {
    font-size: 11px;
    color: #666;
    white-space: nowrap;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }
</style>
