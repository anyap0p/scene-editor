<script>
  import { clamp, snapTime, formatTime } from '../lib/time';
  import { groupBounds, groupMembers, sortedGroups, ungroupedElements } from '../lib/groups';

  /** @type {{
    elements: import('../lib/types').SceneElement[],
    groups: import('../lib/types').TimelineGroup[],
    duration: number,
    currentTime: number,
    selectedIds: string[],
    pxPerSec: number,
    onSeek: (t: number) => void,
    onSelect: (id: string | null, additive?: boolean) => void,
    onSelectGroup: (groupId: string) => void,
    onUpdateTiming: (id: string, start: number, end: number) => void,
    onToggleGroup: (groupId: string) => void,
    onCreateGroup: () => void,
    onUngroup: () => void,
    onDissolveGroup: (groupId: string) => void,
    onRenameGroup: (groupId: string) => void,
  }} */
  let {
    elements,
    groups,
    duration,
    currentTime,
    selectedIds,
    pxPerSec,
    onSeek,
    onSelect,
    onSelectGroup,
    onUpdateTiming,
    onToggleGroup,
    onCreateGroup,
    onUngroup,
    onDissolveGroup,
    onRenameGroup,
  } = $props();

  const MIN_CLIP = 0.2;
  const MIN_PANEL_HEIGHT = 100;
  const DEFAULT_PANEL_HEIGHT = 200;
  const STORAGE_HEIGHT = 'scene-editor-timeline-height';
  const STORAGE_COLLAPSED = 'scene-editor-timeline-collapsed';

  let scrollEl = $state(null);
  let dragClip = $state(null);
  let panelCollapsed = $state(readStoredCollapsed());
  let panelHeight = $state(readStoredHeight());
  let resizing = $state(false);

  let timelineWidth = $derived(Math.max(duration * pxPerSec, 400));
  let maxPanelHeight = $derived(
    typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.75) : 600,
  );

  let projectView = $derived({ elements, groups });
  let orderedGroups = $derived(sortedGroups(projectView));
  let looseElements = $derived(ungroupedElements(projectView));

  function readStoredHeight() {
    try {
      const n = Number(localStorage.getItem(STORAGE_HEIGHT));
      if (Number.isFinite(n) && n >= MIN_PANEL_HEIGHT) return n;
    } catch {
      /* ignore */
    }
    return DEFAULT_PANEL_HEIGHT;
  }

  function readStoredCollapsed() {
    try {
      return localStorage.getItem(STORAGE_COLLAPSED) === '1';
    } catch {
      return false;
    }
  }

  function persistHeight() {
    try {
      localStorage.setItem(STORAGE_HEIGHT, String(panelHeight));
    } catch {
      /* ignore */
    }
  }

  function persistCollapsed() {
    try {
      localStorage.setItem(STORAGE_COLLAPSED, panelCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  function togglePanelCollapsed() {
    panelCollapsed = !panelCollapsed;
    persistCollapsed();
  }

  function startResize(e) {
    if (panelCollapsed) return;
    e.preventDefault();
    resizing = true;
    const startY = e.clientY;
    const startH = panelHeight;

    function onMove(ev) {
      const dy = startY - ev.clientY;
      panelHeight = clamp(startH + dy, MIN_PANEL_HEIGHT, maxPanelHeight);
    }

    function onUp() {
      resizing = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      persistHeight();
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function timeFromX(clientX, rect) {
    const x = clientX - rect.left + (scrollEl?.scrollLeft ?? 0);
    return snapTime(clamp(x / pxPerSec, 0, duration));
  }

  function onRulerDown(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(timeFromX(e.clientX, rect));
  }

  function isSelected(id) {
    return selectedIds.includes(id);
  }

  function groupHasSelection(groupId) {
    return elements.some((e) => e.groupId === groupId && isSelected(e.id));
  }

  function onTrackLabelClick(e, id) {
    onSelect(id, e.ctrlKey || e.metaKey);
  }

  function membersFor(groupId) {
    return groupMembers(projectView, groupId);
  }

  function startClipDrag(e, el, mode) {
    e.stopPropagation();
    onSelect(el.id, false);
    dragClip = {
      kind: 'element',
      id: el.id,
      mode,
      startX: e.clientX,
      origStart: el.start,
      origEnd: el.end,
    };
  }

  function startGroupDrag(e, groupId, mode) {
    e.stopPropagation();
    const members = membersFor(groupId);
    if (members.length === 0) return;
    onSelectGroup(groupId);
    const bounds = groupBounds(members);
    dragClip = {
      kind: 'group',
      groupId,
      mode,
      startX: e.clientX,
      origStart: bounds.start,
      origEnd: bounds.end,
      members: members.map((m) => ({ id: m.id, start: m.start, end: m.end })),
    };
  }

  function onWindowMove(e) {
    if (!dragClip) return;

    const dx = (e.clientX - dragClip.startX) / pxPerSec;
    const dt = snapTime(dx);

    if (dragClip.kind === 'element') {
      const el = elements.find((x) => x.id === dragClip.id);
      if (!el) return;

      if (dragClip.mode === 'move') {
        const len = dragClip.origEnd - dragClip.origStart;
        let start = snapTime(dragClip.origStart + dt);
        start = clamp(start, 0, duration - len);
        onUpdateTiming(dragClip.id, start, start + len);
      } else if (dragClip.mode === 'trim-left') {
        let start = snapTime(clamp(dragClip.origStart + dt, 0, dragClip.origEnd - MIN_CLIP));
        onUpdateTiming(dragClip.id, start, el.end);
      } else if (dragClip.mode === 'trim-right') {
        let end = snapTime(clamp(dragClip.origEnd + dt, dragClip.origStart + MIN_CLIP, duration));
        onUpdateTiming(dragClip.id, el.start, end);
      }
    } else if (dragClip.kind === 'group' && dragClip.mode === 'move') {
      const len = dragClip.origEnd - dragClip.origStart;
      let groupStart = snapTime(dragClip.origStart + dt);
      groupStart = clamp(groupStart, 0, duration - len);
      const delta = groupStart - dragClip.origStart;
      for (const m of dragClip.members) {
        const mlen = m.end - m.start;
        let start = snapTime(m.start + delta);
        start = clamp(start, 0, duration - mlen);
        onUpdateTiming(m.id, start, start + mlen);
      }
    }
  }

  function onWindowUp() {
    dragClip = null;
  }

  function ticks() {
    const step = duration > 30 ? 5 : duration > 10 ? 2 : 1;
    const list = [];
    for (let t = 0; t <= duration; t += step) list.push(t);
    return list;
  }
</script>

<svelte:window onmousemove={onWindowMove} onmouseup={onWindowUp} />

<section
  class="timeline-panel"
  class:collapsed={panelCollapsed}
  class:resizing
  style={panelCollapsed ? undefined : `height: ${panelHeight}px`}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="resize-handle"
    class:hidden={panelCollapsed}
    onmousedown={startResize}
    role="separator"
    aria-orientation="horizontal"
    aria-label="Resize timeline"
    tabindex="-1"
  ></div>

  <div class="timeline-header">
    <div class="header-left">
      <button
        type="button"
        class="collapse-btn"
        onclick={togglePanelCollapsed}
        aria-expanded={!panelCollapsed}
        aria-label={panelCollapsed ? 'Expand timeline' : 'Collapse timeline'}
        title={panelCollapsed ? 'Expand timeline' : 'Collapse timeline'}
      >
        {panelCollapsed ? '▲' : '▼'}
      </button>
      <span>Timeline</span>
    </div>
    <div class="header-actions">
      <button
        type="button"
        class="small"
        onclick={onCreateGroup}
        disabled={selectedIds.length === 0}
        title="Group selected tracks (Ctrl+click to multi-select)"
      >
        Group
      </button>
      <button
        type="button"
        class="small"
        onclick={onUngroup}
        disabled={selectedIds.length === 0}
        title="Remove selected from group"
      >
        Ungroup
      </button>
      <span class="time-readout">{formatTime(currentTime)} / {formatTime(duration)}</span>
    </div>
  </div>

  {#if !panelCollapsed}
    <div class="timeline-scroll" bind:this={scrollEl}>
      <div class="timeline-inner" style="width: {timelineWidth + 120}px;">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="ruler"
          style="width: {timelineWidth}px;"
          onmousedown={onRulerDown}
        >
          {#each ticks() as t}
            <span class="tick" style="left: {t * pxPerSec}px;">{formatTime(t)}</span>
          {/each}
          <div class="playhead" style="left: {currentTime * pxPerSec}px;"></div>
        </div>

        <div class="tracks" style="width: {timelineWidth}px;">
          {#each orderedGroups as group (group.id)}
            {@const members = membersFor(group.id)}
            {@const bounds = groupBounds(members)}
            <div
              class="track-row group-row"
              class:selected={groupHasSelection(group.id)}
              class:is-collapsed={group.collapsed}
            >
              <div class="label-cell group-label-cell">
                <button
                  type="button"
                  class="group-toggle"
                  onclick={() => onToggleGroup(group.id)}
                  aria-expanded={!group.collapsed}
                  title={group.collapsed ? 'Expand group' : 'Collapse group'}
                >
                  {group.collapsed ? '▶' : '▼'}
                </button>
                <button
                  type="button"
                  class="track-label group-label"
                  onclick={() => onSelectGroup(group.id)}
                  ondblclick={() => onRenameGroup(group.id)}
                  title="Double-click to rename"
                >
                  {group.name}
                  <span class="count">({members.length})</span>
                </button>
                <button
                  type="button"
                  class="group-dissolve"
                  onclick={() => onDissolveGroup(group.id)}
                  title="Dissolve group"
                >
                  ×
                </button>
              </div>
              <div class="track-lane">
                {#if group.collapsed && members.length > 0}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="clip group-clip"
                    style="left: {bounds.start * pxPerSec}px; width: {(bounds.end - bounds.start) * pxPerSec}px;"
                    onmousedown={(e) => startGroupDrag(e, group.id, 'move')}
                  ></div>
                {/if}
              </div>
            </div>

            {#if !group.collapsed}
              {#each members as el (el.id)}
                <div class="track-row child-row" class:selected={isSelected(el.id)}>
                  <button
                    type="button"
                    class="track-label"
                    onclick={(e) => onTrackLabelClick(e, el.id)}
                  >
                    {el.label}
                  </button>
                  <div class="track-lane">
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="clip"
                      class:selected={isSelected(el.id)}
                      style="left: {el.start * pxPerSec}px; width: {(el.end - el.start) * pxPerSec}px;"
                      onmousedown={(e) => startClipDrag(e, el, 'move')}
                    >
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="handle left"
                        onmousedown={(e) => startClipDrag(e, el, 'trim-left')}
                      ></div>
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="handle right"
                        onmousedown={(e) => startClipDrag(e, el, 'trim-right')}
                      ></div>
                    </div>
                  </div>
                </div>
              {/each}
            {/if}
          {/each}

          {#each looseElements as el (el.id)}
            <div class="track-row" class:selected={isSelected(el.id)}>
              <button
                type="button"
                class="track-label"
                onclick={(e) => onTrackLabelClick(e, el.id)}
              >
                {el.label}
              </button>
              <div class="track-lane">
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="clip"
                  class:selected={isSelected(el.id)}
                  style="left: {el.start * pxPerSec}px; width: {(el.end - el.start) * pxPerSec}px;"
                  onmousedown={(e) => startClipDrag(e, el, 'move')}
                >
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="handle left"
                    onmousedown={(e) => startClipDrag(e, el, 'trim-left')}
                  ></div>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="handle right"
                    onmousedown={(e) => startClipDrag(e, el, 'trim-right')}
                  ></div>
                </div>
              </div>
            </div>
          {:else}
            {#if orderedGroups.length === 0}
              <p class="empty">Add elements above — each gets a track here.</p>
            {/if}
          {/each}
        </div>
      </div>
    </div>
  {/if}
</section>

<style>
  .timeline-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    min-height: 0;
    border-top: 1px solid var(--border);
    background: var(--panel);
  }

  .timeline-panel.resizing {
    user-select: none;
  }

  .resize-handle {
    flex-shrink: 0;
    height: 6px;
    margin-top: -3px;
    cursor: ns-resize;
    position: relative;
    z-index: 2;
  }

  .resize-handle::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 48px;
    height: 3px;
    border-radius: 2px;
    background: var(--border);
    opacity: 0.8;
  }

  .resize-handle:hover::after,
  .timeline-panel.resizing .resize-handle::after {
    background: var(--accent);
    opacity: 1;
  }

  .resize-handle.hidden {
    display: none;
  }

  .timeline-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    padding: 6px 12px;
    font-weight: 600;
    border-bottom: 1px solid var(--border);
    gap: 8px;
  }

  .timeline-panel.collapsed .timeline-header {
    border-bottom: none;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  button.small {
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 500;
  }

  .collapse-btn,
  .group-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    font-size: 10px;
    line-height: 1;
    color: #aaa;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .collapse-btn:hover,
  .group-toggle:hover {
    color: var(--text, #e8e8e8);
    border-color: #555;
  }

  .time-readout {
    font-weight: 400;
    color: #aaa;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  .timeline-scroll {
    overflow: auto;
    flex: 1;
    min-height: 0;
    padding: 8px 0;
  }

  .timeline-inner {
    padding-left: 120px;
    position: relative;
  }

  .ruler {
    position: relative;
    height: 28px;
    margin-bottom: 4px;
    background: #252525;
    border-radius: 4px;
    cursor: pointer;
  }

  .tick {
    position: absolute;
    top: 6px;
    font-size: 10px;
    color: #888;
    transform: translateX(-50%);
    pointer-events: none;
  }

  .playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #f55;
    pointer-events: none;
    z-index: 5;
  }

  .tracks {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .track-row {
    display: flex;
    align-items: center;
    height: 36px;
    margin-left: -120px;
    width: calc(100% + 120px);
  }

  .track-row.child-row {
    height: 32px;
  }

  .track-row.child-row .track-label {
    padding-left: 28px;
    width: 112px;
    font-size: 11px;
    color: #bbb;
  }

  .track-row.selected .track-label,
  .track-row.selected .group-label {
    color: var(--accent);
  }

  .group-row {
    background: #222;
    border-radius: 4px;
  }

  .group-row.is-collapsed {
    background: #1e1e1e;
  }

  .label-cell {
    display: flex;
    align-items: center;
    width: 112px;
    flex-shrink: 0;
    margin-right: 8px;
    gap: 2px;
  }

  .group-label-cell {
    width: 112px;
  }

  .group-label {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 4px 2px;
    background: transparent;
    border: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 600;
  }

  .group-label .count {
    font-weight: 400;
    color: #888;
  }

  .group-dissolve {
    width: 20px;
    height: 20px;
    padding: 0;
    font-size: 14px;
    line-height: 1;
    color: #666;
    background: transparent;
    border: none;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .group-dissolve:hover {
    color: var(--danger);
    background: #3a2020;
  }

  .track-label {
    width: 112px;
    flex-shrink: 0;
    text-align: left;
    padding: 4px 8px;
    margin-right: 8px;
    background: transparent;
    border: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .child-row .track-label {
    margin-right: 8px;
  }

  .track-lane {
    position: relative;
    flex: 1;
    height: 28px;
    background: var(--track);
    border-radius: 4px;
  }

  .child-row .track-lane {
    height: 24px;
  }

  .clip {
    position: absolute;
    top: 4px;
    height: 20px;
    background: var(--clip);
    border-radius: 4px;
    cursor: grab;
    min-width: 8px;
  }

  .clip.group-clip {
    background: #3d5a80;
    height: 22px;
    top: 3px;
    opacity: 0.85;
  }

  .clip.selected {
    background: var(--clip-selected);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .clip:active {
    cursor: grabbing;
  }

  .handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ew-resize;
  }

  .handle.left {
    left: 0;
    border-radius: 4px 0 0 4px;
  }

  .handle.right {
    right: 0;
    border-radius: 0 4px 4px 0;
  }

  .empty {
    margin: 12px;
    color: #666;
    font-size: 13px;
  }
</style>
