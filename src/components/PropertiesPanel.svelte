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
  import { DEFAULT_PLAYBACK_SPEED, isGifSrc } from '../lib/media';
  import {
    defaultCrop,
    hasCrop,
    setCropShape,
  } from '../lib/crop';

  /** @type {{
    element: import('../lib/types').SceneElement | null,
    selectionCount: number,
    cropEditingId: string | null,
    cropEditDraft: import('../lib/crop').ElementCrop | null,
    onUpdate: (id: string, patch: Partial<import('../lib/types').SceneElement>) => void,
    onDelete: (id: string) => void,
    onCenterEach: () => void,
    onCenterGroup: () => void,
    onStartCropEdit: () => void,
    onCropDraftChange: (crop: import('../lib/crop').ElementCrop | null) => void,
    onConfirmCropEdit: () => void,
    onCancelCropEdit: () => void,
  }} */
  let {
    element,
    selectionCount,
    cropEditingId,
    cropEditDraft,
    onUpdate,
    onDelete,
    onCenterEach,
    onCenterGroup,
    onStartCropEdit,
    onCropDraftChange,
    onConfirmCropEdit,
    onCancelCropEdit,
  } = $props();

  let showGroupCenter = $derived(selectionCount > 1);
  let showPlaybackSpeed = $derived(
    element != null &&
      (element.type === 'video' || (element.type === 'image' && isGifSrc(element.src))),
  );
  let showMediaCrop = $derived(
    element != null && (element.type === 'image' || element.type === 'video'),
  );
  let isCropEditing = $derived(
    element != null && cropEditingId === element.id,
  );
  let draftShape = $derived(cropEditDraft?.shape ?? 'rounded');
  let showCornerRadius = $derived(isCropEditing && draftShape === 'rounded');

  /** @type {import('../lib/fonts').FontOption[]} */
  let installedFonts = $state([]);
  /** @type {'idle' | 'loading' | 'ready' | 'unsupported' | 'denied' | 'error'} */
  let installedFontStatus = $state('idle');

  let extraFontOption = $derived(
    element?.type === 'text'
      ? fontOptionForCurrent(element.fontFamily, installedFonts)
      : null,
  );

  function changeCropShape(shape) {
    if (!element) return;
    const base = cropEditDraft ?? defaultCrop(shape, element.width, element.height);
    onCropDraftChange(setCropShape(base, shape, element.width, element.height));
  }

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
  {#if (element || selectionCount > 0) && !isCropEditing}
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
    {#if isCropEditing}
      <div class="crop-edit">
        <h3 class="crop-title">Edit crop</h3>
        <p class="hint">Drag and resize within the element. Click OK to save or Cancel to discard.</p>

        <label>
          Crop shape
          <select value={draftShape} onchange={(e) => changeCropShape(e.currentTarget.value)}>
            <option value="rounded">Rounded corners</option>
            <option value="circle">Circle</option>
            <option value="heart">Heart</option>
          </select>
        </label>

        {#if showCornerRadius && cropEditDraft}
          <label>
            Corner radius (px)
            <input
              type="number"
              min="0"
              max="500"
              step="1"
              value={cropEditDraft.cornerRadius ?? 16}
              oninput={(e) =>
                onCropDraftChange({
                  ...cropEditDraft,
                  cornerRadius: Number(e.currentTarget.value),
                })}
            />
          </label>
        {/if}

        <button type="button" class="crop-reset" onclick={() => onCropDraftChange(null)}>
          Reset to full image
        </button>

        <div class="crop-actions">
          <button type="button" onclick={onCancelCropEdit}>Cancel</button>
          <button type="button" class="primary" onclick={onConfirmCropEdit}>OK</button>
        </div>
      </div>
    {:else}
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

    {#if showPlaybackSpeed}
      <label>
        Playback speed
        <input
          type="number"
          min="0.1"
          max="4"
          step="0.1"
          value={element.playbackSpeed ?? DEFAULT_PLAYBACK_SPEED}
          oninput={(e) =>
            onUpdate(element.id, { playbackSpeed: Number(e.currentTarget.value) })}
        />
        <span class="hint inline-hint">1 = normal, 0.5 = half speed, 2 = double</span>
      </label>
    {/if}

    {#if showMediaCrop}
      <div class="crop-section">
        {#if hasCrop(element)}
          <p class="hint crop-status">
            Crop: {element.crop.shape}
            {#if element.crop.shape === 'rounded' && element.crop.cornerRadius}
              ({element.crop.cornerRadius}px radius)
            {/if}
          </p>
        {:else}
          <p class="hint crop-status">No crop applied</p>
        {/if}
        <button type="button" class="crop-edit-btn" onclick={onStartCropEdit}>Edit crop</button>
      </div>
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
    {/if}
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

  .inline-hint {
    font-size: 11px;
    line-height: 1.35;
  }

  .crop-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .crop-status {
    font-size: 12px;
  }

  .crop-edit-btn {
    width: 100%;
  }

  .crop-edit {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .crop-title {
    margin: 0;
    font-size: 14px;
  }

  .crop-reset {
    width: 100%;
    font-size: 12px;
  }

  .crop-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .crop-actions button {
    flex: 1;
  }
</style>
