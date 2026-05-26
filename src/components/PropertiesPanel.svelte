<script>
  import { onMount } from 'svelte';
  import {
    TEXT_FONTS,
    cssFontFamilyForName,
    fontOptionForCurrent,
    isLocalFontAccessSupported,
    queryInstalledFonts,
    resolveFontFamily,
  } from '../lib/fonts';

  /** @type {{
    element: import('../lib/types').SceneElement | null,
    selectionCount: number,
    onUpdate: (id: string, patch: Partial<import('../lib/types').SceneElement>) => void,
    onDelete: (id: string) => void,
    onCenterEach: () => void,
    onCenterGroup: () => void,
  }} */
  let {
    element,
    selectionCount,
    onUpdate,
    onDelete,
    onCenterEach,
    onCenterGroup,
  } = $props();

  let showGroupCenter = $derived(selectionCount > 1);

  /** @type {import('../lib/fonts').FontOption[]} */
  let installedFonts = $state([]);
  /** @type {'idle' | 'loading' | 'ready' | 'unsupported' | 'denied' | 'error'} */
  let installedFontStatus = $state('idle');

  let extraFontOption = $derived(
    element?.type === 'text'
      ? fontOptionForCurrent(element.fontFamily, installedFonts)
      : null,
  );

  async function refreshInstalledFonts() {
    if (!isLocalFontAccessSupported()) {
      installedFontStatus = 'unsupported';
      installedFonts = [];
      return;
    }
    installedFontStatus = 'loading';
    try {
      installedFonts = await queryInstalledFonts();
      installedFontStatus = 'ready';
    } catch (err) {
      installedFonts = [];
      installedFontStatus =
        err && typeof err === 'object' && 'name' in err && err.name === 'SecurityError'
          ? 'denied'
          : 'error';
    }
  }

  onMount(() => {
    refreshInstalledFonts();
  });
</script>

<aside class="props">
  <h2>Properties</h2>
  {#if element || selectionCount > 0}
    <div class="align-section">
      <span class="section-label">Align</span>
      <div class="align-buttons">
        <button
          type="button"
          onclick={onCenterEach}
          title={selectionCount > 1
            ? 'Center each selected element on the canvas'
            : 'Center this element on the canvas'}
        >
          {selectionCount > 1 ? 'Center each' : 'Center on canvas'}
        </button>
        {#if showGroupCenter}
          <button
            type="button"
            onclick={onCenterGroup}
            title="Center the selection as a group (keeps relative positions)"
          >
            Center group
          </button>
        {/if}
      </div>
    </div>
  {/if}

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
      <div class="font-section">
        <label>
          Font
          <select
            value={resolveFontFamily(element.fontFamily)}
            onchange={(e) => onUpdate(element.id, { fontFamily: e.currentTarget.value })}
          >
            <optgroup label="Built-in &amp; web">
              {#each TEXT_FONTS as font (font.value)}
                <option value={font.value} style="font-family: {font.value}">{font.label}</option>
              {/each}
            </optgroup>
            {#if installedFonts.length > 0}
              <optgroup label="Installed on this device">
                {#each installedFonts as font (font.value)}
                  <option value={font.value} style="font-family: {font.value}">{font.label}</option>
                {/each}
              </optgroup>
            {/if}
            {#if extraFontOption}
              <optgroup label="Other">
                <option value={extraFontOption.value} style="font-family: {extraFontOption.value}">
                  {extraFontOption.label}
                </option>
              </optgroup>
            {/if}
          </select>
        </label>

        {#if isLocalFontAccessSupported()}
          <button
            type="button"
            class="font-refresh"
            disabled={installedFontStatus === 'loading'}
            onclick={refreshInstalledFonts}
          >
            {installedFontStatus === 'loading' ? 'Loading fonts…' : 'Refresh installed fonts'}
          </button>
          {#if installedFontStatus === 'denied'}
            <p class="hint">Font access was blocked. Allow it when prompted, then refresh.</p>
          {:else if installedFontStatus === 'ready' && installedFonts.length === 0}
            <p class="hint">No extra installed fonts found (built-in list may already include them).</p>
          {/if}
        {:else}
          <label class="custom-font">
            <span class="custom-font-label">Custom font name</span>
            <input
              type="text"
              placeholder="Exact name as installed on Windows"
              onchange={(e) => {
                const name = e.currentTarget.value.trim();
                if (name) onUpdate(element.id, { fontFamily: cssFontFamilyForName(name) });
              }}
            />
          </label>
          <p class="hint">Use Chrome or Edge to pick from installed fonts automatically.</p>
        {/if}

        <p class="hint font-note">
          Installed fonts work in the editor on your PC. Exported HTML only shows them on devices
          that have the same font installed.
        </p>
      </div>
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
        Weight
        <select
          value={element.fontWeight ?? '600'}
          onchange={(e) => onUpdate(element.id, { fontWeight: e.currentTarget.value })}
        >
          <option value="400">Regular</option>
          <option value="600">Semi-bold</option>
          <option value="700">Bold</option>
        </select>
      </label>
      <label>
        Color
        <input
          type="color"
          value={element.color ?? '#ffffff'}
          oninput={(e) => onUpdate(element.id, { color: e.currentTarget.value })}
        />
      </label>
      <label>
        Rotation (°)
        <input
          type="number"
          step="1"
          value={element.rotation ?? 0}
          oninput={(e) =>
            onUpdate(element.id, { rotation: Number(e.currentTarget.value) })}
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
  {:else if selectionCount > 0}
    <p class="hint">{selectionCount} elements selected. Use align buttons above.</p>
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

  .align-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .align-buttons {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .align-buttons button {
    width: 100%;
    font-size: 12px;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
    color: #aaa;
  }

  .font-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .font-refresh {
    width: 100%;
    padding: 6px 8px;
    font-size: 11px;
  }

  .font-note {
    margin: 0;
    font-size: 11px;
    line-height: 1.35;
  }

  .custom-font-label {
    font-size: 12px;
    color: #aaa;
  }

  select {
    width: 100%;
    padding: 6px 8px;
    background: #252525;
    border: 1px solid var(--border);
    border-radius: 4px;
    color: inherit;
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
