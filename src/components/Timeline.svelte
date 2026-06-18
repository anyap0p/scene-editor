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
    onAssignToGroup: (elementIds: string[], groupId: string) => void,
    embedded?: boolean,
    onGestureStart?: () => void,
    onGestureEnd?: () => void,
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
    onAssignToGroup,
    onGestureStart,
    onGestureEnd,
    embedded = false,
  } = $props();

  const MIN_CLIP = 0.2;
  const MIN_PANEL_HEIGHT = 100;
  const DEFAULT_PANEL_HEIGHT = 200;
  const LABEL_WIDTH = 120;
  /** Must match the zoom slider range in App.svelte */
  const ZOOM_MIN = 40;
  const ZOOM_MAX = 160;
  const STORAGE_HEIGHT = 'scene-editor-timeline-height';
  const STORAGE_COLLAPSED = 'scene-editor-timeline-collapsed';

  let scrollEl = $state(null);
  let rulerEl = $state(null);
  /** Width of the time axis (ruler / lanes), updated when the panel is resized. */
  let viewportLaneWidth = $state(400);
  let dragClip = $state(null);
  /** @type {{ elementIds: string[], startX: number, startY: number, active?: boolean } | null} */
  let pendingTrackDrag = $state(null);
  /** @type {{ elementIds: string[] } | null} */
  let dragTrack = $state(null);
  let dropTargetGroupId = $state(null);
  let suppressLabelClick = false;
  let panelCollapsed = $state(readStoredCollapsed());
  let panelHeight = $state(readStoredHeight());
  let resizing = $state(false);

  /** Pixels/sec when the full duration fits the visible lane (furthest zoom out). */
  let fitPxPerSec = $derived(
    duration > 0 ? viewportLaneWidth / duration : ZOOM_MIN,
  );

  /** Slider 0% = fit to width; 100% = ZOOM_MAX px/s (scroll when longer than the lane). */
  let pxScale = $derived.by(() => {
    if (duration <= 0) return pxPerSec;
    const t = clamp((pxPerSec - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN), 0, 1);
    return fitPxPerSec + t * (ZOOM_MAX - fitPxPerSec);
  });

  let timelineWidth = $derived(
    duration > 0
      ? Math.max(duration * pxScale, viewportLaneWidth)
      : viewportLaneWidth,
  );
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

  $effect(() => {
    const el = scrollEl;
    if (!el) return;
    const update = () => {
      viewportLaneWidth = Math.max(100, el.clientWidth - LABEL_WIDTH);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  });

  function timeFromClientX(clientX) {
    const el = rulerEl;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const w = rect.width;
    if (w <= 0) return 0;
    const x = clientX - rect.left;
    return snapTime(clamp((x / w) * duration, 0, duration));
  }

  function onRulerDown(e) {
    onSeek(timeFromClientX(e.clientX));
  }

  function onLaneDown(e) {
    if (e.target !== e.currentTarget) return;
    onSeek(timeFromClientX(e.clientX));
  }

  function isSelected(id) {
    return selectedIds.includes(id);
  }

  function isTrackSelected(id) {
    if (dragClip?.kind === 'element') return dragClip.id === id;
    if (dragClip?.kind === 'group') {
      return dragClip.members?.some((m) => m.id === id) ?? false;
    }
    return isSelected(id);
  }

  function isClipSelected(id) {
    if (dragClip?.kind === 'element') return dragClip.id === id;
    if (dragClip?.kind === 'group') {
      return dragClip.members?.some((m) => m.id === id) ?? false;
    }
    return isSelected(id);
  }

  function groupRowSelected(groupId) {
    if (dragClip?.kind === 'element') return false;
    if (dragClip?.kind === 'group') return dragClip.groupId === groupId;
    return elements.some((e) => e.groupId === groupId && isSelected(e.id));
  }

  function onTrackLabelClick(e, id) {
    if (dragTrack || pendingTrackDrag?.active) return;
    if (suppressLabelClick) {
      suppressLabelClick = false;
      return;
    }
    onSelect(id, e.ctrlKey || e.metaKey);
  }

  function trackDragIds(el) {
    if (isSelected(el.id) && selectedIds.length > 0) return [...selectedIds];
    return [el.id];
  }

  function onLabelMouseDown(e, el) {
    if (e.button !== 0) return;
    e.stopPropagation();
    pendingTrackDrag = {
      elementIds: trackDragIds(el),
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };
  }

  function groupIdAtPoint(clientX, clientY) {
    const hit = document.elementFromPoint(clientX, clientY);
    const row = hit?.closest('[data-group-drop]');
    return row?.getAttribute('data-group-drop') ?? null;
  }

  function canDropOnGroup(groupId, elementIds) {
    const moving = elements.filter((e) => elementIds.includes(e.id));
    return moving.some((e) => e.groupId !== groupId);
  }

  function membersFor(groupId) {
    return groupMembers(projectView, groupId);
  }

  function startClipDrag(e, el, mode) {
    e.preventDefault();
    e.stopPropagation();
    onGestureStart?.();
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
    onGestureStart?.();
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
    if (pendingTrackDrag && !dragClip) {
      const dy = Math.abs(e.clientY - pendingTrackDrag.startY);
      const dx = Math.abs(e.clientX - pendingTrackDrag.startX);
      if (dy > 5 && dy >= dx) {
        pendingTrackDrag.active = true;
        dragTrack = { elementIds: pendingTrackDrag.elementIds };
        pendingTrackDrag = null;
      }
    }

    if (dragTrack) {
      const gid = groupIdAtPoint(e.clientX, e.clientY);
      dropTargetGroupId =
        gid && canDropOnGroup(gid, dragTrack.elementIds) ? gid : null;
      return;
    }

    if (!dragClip) return;

    const dx = (e.clientX - dragClip.startX) / pxScale;
    const dt = snapTime(dx);

    if (dragClip.kind === 'element') {
      const el = elements.find((x) => x.id === dragClip.id);
      if (!el) return;

      if (dragClip.mode === 'move') {
        const len = dragClip.origEnd - dragClip.origStart;
        let start = snapTime(dragClip.origStart + dt);
        start = clamp(start, 0, duration - len);
      onUpdateTiming(dragClip.id, start, start + len, { skipHistory: true });
    } else if (dragClip.mode === 'trim-left') {
        let start = snapTime(clamp(dragClip.origStart + dt, 0, dragClip.origEnd - MIN_CLIP));
      onUpdateTiming(dragClip.id, start, el.end, { skipHistory: true });
    } else if (dragClip.mode === 'trim-right') {
      let end = snapTime(clamp(dragClip.origEnd + dt, dragClip.origStart + MIN_CLIP, duration));
      onUpdateTiming(dragClip.id, el.start, end, { skipHistory: true });
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
        onUpdateTiming(m.id, start, start + mlen, { skipHistory: true });
      }
    }
  }

  function onWindowUp(e) {
    const didDrag = !!(dragClip || dragTrack);
    if (dragTrack && dropTargetGroupId) {
      onAssignToGroup(dragTrack.elementIds, dropTargetGroupId);
    }
    if (dragClip || dragTrack) onGestureEnd?.();
    dragClip = null;
    dragTrack = null;
    pendingTrackDrag = null;
    dropTargetGroupId = null;
    if (didDrag) suppressLabelClick = true;
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
  class:embedded
  class:resizing
  class:dragging-track={!!dragTrack}
  style={panelCollapsed || embedded ? undefined : `height: ${panelHeight}px`}
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="resize-handle"
    class:hidden={panelCollapsed || embedded}
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
        title="Group selected tracks (Ctrl+click to multi-select, or drag labels onto a group)"
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
      <div class="timeline-inner" style="width: {timelineWidth + LABEL_WIDTH}px;">
        <div class="ruler-row">
          <div class="ruler-gutter" aria-hidden="true"></div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="ruler"
            bind:this={rulerEl}
            style="width: {timelineWidth}px;"
            onmousedown={onRulerDown}
          >
            {#each ticks() as t}
              <span class="tick" style="left: {t * pxScale}px;">{formatTime(t)}</span>
            {/each}
            <div class="playhead" style="left: {currentTime * pxScale}px;"></div>
          </div>
        </div>

        <div class="tracks">
          {#each orderedGroups as group (group.id)}
            {@const members = membersFor(group.id)}
            {@const bounds = groupBounds(members)}
            <div
              class="track-row group-row"
              class:selected={groupRowSelected(group.id)}
              class:is-collapsed={group.collapsed}
              class:drop-target={dropTargetGroupId === group.id}
              data-group-drop={group.id}
            >
              <div class="label-cell group-label-cell sticky-label">
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
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="track-lane"
                style="width: {timelineWidth}px;"
                onmousedown={onLaneDown}
              >
                {#if group.collapsed && members.length > 0}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="clip group-clip"
                    style="left: {bounds.start * pxScale}px; width: {(bounds.end - bounds.start) * pxScale}px;"
                    onmousedown={(e) => startGroupDrag(e, group.id, 'move')}
                  ></div>
                {/if}
              </div>
            </div>

            {#if !group.collapsed}
              {#each members as el (el.id)}
                <div class="track-row child-row" class:selected={isTrackSelected(el.id)}>
                  <button
                    type="button"
                    class="track-label draggable sticky-label"
                    onclick={(e) => onTrackLabelClick(e, el.id)}
                    onmousedown={(e) => onLabelMouseDown(e, el)}
                    title="Drag label into a group"
                  >
                    {el.label}
                  </button>
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="track-lane"
                    style="width: {timelineWidth}px;"
                    onmousedown={onLaneDown}
                  >
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                      class="clip"
                      class:selected={isClipSelected(el.id)}
                      style="left: {el.start * pxScale}px; width: {(el.end - el.start) * pxScale}px;"
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
              {#if !group.collapsed && members.length === 0}
                <div
                  class="track-row group-drop-hint"
                  class:drop-target={dropTargetGroupId === group.id}
                  data-group-drop={group.id}
                >
                  <div class="sticky-label drop-hint-label">
                    <span class="drop-hint-text">Drop tracks here</span>
                  </div>
                  <div class="track-lane drop-hint-lane" style="width: {timelineWidth}px;"></div>
                </div>
              {/if}
            {/if}
          {/each}

          {#each looseElements as el (el.id)}
            <div class="track-row" class:selected={isTrackSelected(el.id)}>
              <button
                type="button"
                class="track-label draggable sticky-label"
                onclick={(e) => onTrackLabelClick(e, el.id)}
                onmousedown={(e) => onLabelMouseDown(e, el)}
                title="Drag label into a group"
              >
                {el.label}
              </button>
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="track-lane"
                style="width: {timelineWidth}px;"
                onmousedown={onLaneDown}
              >
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="clip"
                  class:selected={isClipSelected(el.id)}
                  style="left: {el.start * pxScale}px; width: {(el.end - el.start) * pxScale}px;"
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
    min-width: 0;
    max-width: 100%;
    border-top: 1px solid var(--border);
    background: var(--panel);
    overflow: hidden;
  }

  .timeline-panel.embedded {
    flex: 1;
    height: 100%;
    min-height: 0;
    border-top: none;
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
    overflow-x: auto;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    min-width: 0;
    padding: 8px 0;
  }

  .timeline-inner {
    position: relative;
    box-sizing: border-box;
  }

  .ruler-row {
    display: flex;
    align-items: stretch;
    margin-bottom: 4px;
  }

  .ruler-gutter {
    position: sticky;
    left: 0;
    z-index: 4;
    flex-shrink: 0;
    width: 120px;
    background: var(--panel);
    box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.45);
  }

  .ruler {
    position: relative;
    flex-shrink: 0;
    height: 28px;
    background: #252525;
    border-radius: 4px;
    cursor: pointer;
  }

  .sticky-label {
    position: sticky;
    left: 0;
    z-index: 2;
    flex-shrink: 0;
    width: 120px;
    box-sizing: border-box;
    background: var(--panel);
    box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.45);
  }

  .group-row .sticky-label {
    background: #222;
  }

  .group-row.is-collapsed .sticky-label {
    background: #1e1e1e;
  }

  .group-row.drop-target .sticky-label,
  .group-drop-hint.drop-target .sticky-label {
    background: #2a3348;
  }

  .group-row.selected .sticky-label {
    background: #222;
  }

  .group-row.is-collapsed.selected .sticky-label {
    background: #1e1e1e;
  }

  .track-row.selected:not(.group-row) .sticky-label {
    background: var(--panel);
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
    box-sizing: border-box;
  }

  .track-row.child-row {
    height: 32px;
  }

  .track-row.child-row .track-label.sticky-label {
    padding-left: 28px;
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

  .group-row.drop-target,
  .group-drop-hint.drop-target {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
    background: #2a3348;
  }

  .timeline-panel.dragging-track {
    user-select: none;
  }

  .timeline-panel.dragging-track .track-label.draggable {
    cursor: grabbing;
  }

  .track-label.draggable {
    cursor: grab;
  }

  .track-label.draggable:active {
    cursor: grabbing;
  }

  .group-drop-hint {
    height: 28px;
  }

  .drop-hint-label {
    display: flex;
    align-items: center;
    padding-left: 36px;
    z-index: 1;
  }

  .drop-hint-lane {
    background: transparent;
    cursor: default;
    pointer-events: none;
  }

  .drop-hint-text {
    font-size: 11px;
    color: #555;
    font-style: italic;
  }

  .group-drop-hint.drop-target .drop-hint-text {
    color: var(--accent);
  }

  .label-cell {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-right: 8px;
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
    text-align: left;
    padding: 4px 8px;
    border: none;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .track-lane {
    position: relative;
    flex-shrink: 0;
    height: 28px;
    background: var(--track);
    border-radius: 4px;
    cursor: pointer;
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
