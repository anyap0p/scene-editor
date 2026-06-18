<script>
  import { onMount, onDestroy } from 'svelte';
  import Canvas from './components/Canvas.svelte';
  import Timeline from './components/Timeline.svelte';
  import PropertiesPanel from './components/PropertiesPanel.svelte';
  import ProjectPicker from './components/ProjectPicker.svelte';
  import { defaultElement } from './lib/types';
  import { exportProjectJson, exportStandaloneHtml, downloadFile } from './lib/export';
  import { clamp } from './lib/time';
  import {
    elementToPlain,
    duplicateElements,
    serializeClipboard,
    parseClipboardText,
    isEditableTarget,
  } from './lib/elements';
  import {
    defaultProject,
    cloneProject,
    ensureProjects,
    listProjectMetas,
    getProject,
    putProject,
    createProject,
    deleteProject,
    setActiveId,
  } from './lib/db';
  import {
    normalizeProject,
    createGroup,
    dissolveGroup,
    ungroupElements,
    toggleGroupCollapsed,
    renameGroup,
    assignElementsToGroup,
  } from './lib/groups';
  import { PREVIEW_CHANNEL, openPreviewPopout } from './lib/previewSync';
  import { centerElementsEach, centerElementsAsGroup } from './lib/align';
  import { createUndoStack } from './lib/history';

  let project = $state(defaultProject());
  let activeProjectId = $state(null);
  let projectList = $state([]);
  let saveStatus = $state('idle');
  let dbReady = $state(false);
  let skipAutosave = $state(true);

  let currentTime = $state(0);
  let selectedId = $state(null);
  let timelineSelection = $state([]);
  /** Set when a group row is selected on the timeline (including empty groups). */
  let focusedGroupId = $state(null);
  let isPlaying = $state(false);
  let pxPerSec = $state(80);

  let imageInput = $state(null);
  let videoInput = $state(null);
  let jsonInput = $state(null);

  let selectedElement = $derived(
    project.elements.find((e) => e.id === selectedId) ?? null,
  );

  let rafId = 0;
  let playStart = 0;
  let playFrom = 0;
  let savedFadeTimer = 0;
  let saveGeneration = 0;
  /** @type {import('./lib/types').SceneElement[]} */
  let clipboardElements = [];
  let pasteCount = 0;
  let previewPopoutOpen = $state(false);
  /** @type {Window | null} */
  let previewPopoutWin = null;
  /** @type {BroadcastChannel | null} */
  let previewChannel = null;
  let popoutWatchId = 0;
  const undoStack = createUndoStack();
  let canUndo = $state(false);
  let canRedo = $state(false);
  let gestureDepth = 0;

  function refreshUndoState() {
    canUndo = undoStack.canUndo();
    canRedo = undoStack.canRedo();
  }

  function recordUndo() {
    undoStack.push(project);
    refreshUndoState();
  }

  function beginGesture() {
    if (gestureDepth === 0) recordUndo();
    gestureDepth += 1;
  }

  function endGesture() {
    gestureDepth = Math.max(0, gestureDepth - 1);
  }

  function restoreProject(snapshot) {
    undoStack.setRecording(false);
    project = normalizeProject(snapshot);
    undoStack.setRecording(true);
    refreshUndoState();
    postPreviewSync();
  }

  function undo() {
    const prev = undoStack.undo(project);
    if (prev) restoreProject(prev);
  }

  function redo() {
    const next = undoStack.redo(project);
    if (next) restoreProject(next);
  }

  async function refreshProjectList() {
    projectList = await listProjectMetas();
  }

  function resetPlayback() {
    currentTime = 0;
    selectedId = null;
    timelineSelection = [];
    focusedGroupId = null;
    isPlaying = false;
    cancelAnimationFrame(rafId);
  }

  function setSelection(ids) {
    timelineSelection = ids;
    selectedId = ids.length > 0 ? ids[ids.length - 1] : null;
  }

  function selectFromTimeline(id, additive = false) {
    if (!id) {
      focusedGroupId = null;
      setSelection([]);
      return;
    }
    if (!additive) focusedGroupId = null;
    if (additive) {
      const next = new Set(timelineSelection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelection([...next]);
    } else {
      setSelection([id]);
    }
  }

  function selectFromCanvas(id) {
    focusedGroupId = null;
    setSelection(id ? [id] : []);
  }

  function selectGroup(groupId) {
    focusedGroupId = groupId;
    const ids = project.elements.filter((e) => e.groupId === groupId).map((e) => e.id);
    setSelection(ids);
  }

  function groupIdForNewElement() {
    const groups = project.groups ?? [];
    if (
      focusedGroupId &&
      groups.some((g) => g.id === focusedGroupId)
    ) {
      return focusedGroupId;
    }
    if (timelineSelection.length === 0) return null;
    const ids = new Set(
      timelineSelection
        .map((id) => project.elements.find((e) => e.id === id)?.groupId)
        .filter((gid) => gid != null),
    );
    return ids.size === 1 ? [...ids][0] : null;
  }

  function appendNewElement(el) {
    project.elements = [...project.elements, el];
    const gid = groupIdForNewElement();
    if (gid) {
      project = assignElementsToGroup(project, [el.id], gid);
      const group = (project.groups ?? []).find((g) => g.id === gid);
      if (group?.collapsed) {
        project = toggleGroupCollapsed(project, gid);
      }
    }
    setSelection([el.id]);
  }

  async function loadProjectById(id) {
    const stored = await getProject(id);
    if (!stored) return false;
    skipAutosave = true;
    activeProjectId = id;
    setActiveId(id);
    project = normalizeProject(stored.project);
    resetPlayback();
    undoStack.clear();
    recordUndo();
    await refreshProjectList();
    skipAutosave = false;
    saveStatus = 'idle';
    return true;
  }

  async function selectProject(id) {
    if (id === activeProjectId) return;
    await loadProjectById(id);
  }

  async function newProject() {
    const n = projectList.length + 1;
    const id = await createProject(defaultProject(`Untitled scene ${n}`));
    await refreshProjectList();
    await loadProjectById(id);
  }

  async function deleteCurrentProject() {
    if (!activeProjectId || projectList.length <= 1) return;
    const name = project.name;
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

    const deletingId = activeProjectId;
    const remaining = projectList.filter((p) => p.id !== deletingId);
    await deleteProject(deletingId);
    await refreshProjectList();
    const nextId = remaining[0]?.id ?? (await ensureProjects());
    await loadProjectById(nextId);
  }

  function postPreviewSync() {
    if (!previewChannel || !previewPopoutOpen) return;
    previewChannel.postMessage({
      type: 'sync',
      elements: cloneProject(project).elements,
      currentTime,
      selectedId,
      canvasWidth: project.canvasWidth,
      canvasHeight: project.canvasHeight,
      duration: project.duration,
      isPlaying,
      playbackStartedAt: playStart,
      playFrom,
    });
  }

  function postPreviewTick() {
    if (!previewChannel || !previewPopoutOpen || !isPlaying) return;
    previewChannel.postMessage({
      type: 'tick',
      currentTime,
      playbackStartedAt: playStart,
      playFrom,
    });
  }

  function handlePreviewMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready':
        postPreviewSync();
        break;
      case 'select':
        selectFromCanvas(msg.id);
        postPreviewSync();
        break;
      case 'update':
        updateElement(msg.id, msg.patch, { skipHistory: true });
        break;
      case 'seek':
        seek(msg.time);
        postPreviewSync();
        break;
      case 'play':
        if (msg.playing !== isPlaying) togglePlay();
        break;
      case 'tick':
        if (!isPlaying) break;
        currentTime = msg.currentTime;
        playFrom = msg.playFrom;
        playStart = msg.playbackStartedAt;
        break;
    }
  }

  function watchPopoutClosed() {
    clearInterval(popoutWatchId);
    popoutWatchId = setInterval(() => {
      if (previewPopoutWin?.closed) {
        previewPopoutOpen = false;
        previewPopoutWin = null;
        clearInterval(popoutWatchId);
      }
    }, 400);
  }

  function popOutPreview() {
    if (previewPopoutWin && !previewPopoutWin.closed) {
      previewPopoutWin.focus();
      return;
    }
    const win = openPreviewPopout();
    if (!win) {
      alert('Pop-up blocked. Allow pop-ups for this site to use the preview window.');
      return;
    }
    previewPopoutWin = win;
    previewPopoutOpen = true;
    watchPopoutClosed();
    postPreviewSync();
  }

  function dockPreview() {
    previewPopoutWin?.close();
    previewPopoutOpen = false;
    previewPopoutWin = null;
    clearInterval(popoutWatchId);
  }

  onMount(async () => {
    previewChannel = new BroadcastChannel(PREVIEW_CHANNEL);
    previewChannel.onmessage = (e) => handlePreviewMessage(e.data);

    try {
      const id = await ensureProjects();
      await refreshProjectList();
      await loadProjectById(id);
      undoStack.clear();
      recordUndo();
      dbReady = true;
    } catch (err) {
      console.error('Failed to open local database', err);
      alert('Could not open local project storage. Changes will not be saved.');
      dbReady = true;
      skipAutosave = false;
    }
  });

  onDestroy(() => {
    clearInterval(popoutWatchId);
    previewChannel?.close();
    if (previewPopoutWin && !previewPopoutWin.closed) previewPopoutWin.close();
  });

  $effect(() => {
    if (!previewPopoutOpen) return;
    project.elements;
    project.canvasWidth;
    project.canvasHeight;
    currentTime;
    selectedId;
    isPlaying;
    postPreviewSync();
  });

  $effect(() => {
    if (!dbReady || skipAutosave || !activeProjectId) return;

    const snapshot = cloneProject(project);
    const id = activeProjectId;
    const gen = ++saveGeneration;

    saveStatus = 'saving';
    const timer = setTimeout(async () => {
      try {
        await putProject(id, snapshot);
        if (gen !== saveGeneration) return;
        saveStatus = 'saved';
        await refreshProjectList();
        clearTimeout(savedFadeTimer);
        savedFadeTimer = setTimeout(() => {
          if (saveStatus === 'saved') saveStatus = 'idle';
        }, 2000);
      } catch (err) {
        if (gen !== saveGeneration) return;
        console.error('Auto-save failed', err);
        saveStatus = 'error';
      }
    }, 500);

    return () => clearTimeout(timer);
  });

  function updateElement(id, patch, opts = {}) {
    if (!opts.skipHistory && gestureDepth === 0) recordUndo();
    project.elements = project.elements.map((el) =>
      el.id === id ? { ...el, ...patch } : el,
    );
  }

  function updateElementFromPanel(id, patch) {
    recordUndo();
    updateElement(id, patch, { skipHistory: true });
  }

  function updateTiming(id, start, end, opts = {}) {
    const s = clamp(start, 0, project.duration);
    const e = clamp(end, s + 0.1, project.duration);
    updateElement(id, { start: s, end: e }, opts);
  }

  function addElement(type) {
    recordUndo();
    const el = defaultElement(type, project.duration, currentTime);
    el.zIndex = project.elements.length + 1;
    appendNewElement(el);
  }

  function deleteElement(id) {
    recordUndo();
    project.elements = project.elements.filter((e) => e.id !== id);
    setSelection(timelineSelection.filter((sid) => sid !== id));
  }

  function createGroupFromSelection() {
    recordUndo();
    const ids =
      timelineSelection.length > 0
        ? timelineSelection
        : selectedId
          ? [selectedId]
          : [];
    if (ids.length === 0) return;
    const defaultName = `Group ${(project.groups ?? []).length + 1}`;
    const name = prompt('Group name', defaultName);
    if (name === null) return;
    project = createGroup(project, ids, name).project;
  }

  function ungroupSelection() {
    recordUndo();
    const ids =
      timelineSelection.length > 0
        ? timelineSelection
        : selectedId
          ? [selectedId]
          : [];
    if (ids.length === 0) return;
    project = ungroupElements(project, ids);
  }

  function handleDissolveGroup(groupId) {
    if (!confirm('Dissolve this group? Tracks will be ungrouped.')) return;
    recordUndo();
    project = dissolveGroup(project, groupId);
    if (focusedGroupId === groupId) focusedGroupId = null;
    setSelection(timelineSelection.filter((id) => {
      const el = project.elements.find((e) => e.id === id);
      return el && el.groupId !== groupId;
    }));
  }

  function handleToggleGroup(groupId) {
    project = toggleGroupCollapsed(project, groupId);
  }

  function handleRenameGroup(groupId) {
    const group = (project.groups ?? []).find((g) => g.id === groupId);
    if (!group) return;
    const name = prompt('Group name', group.name);
    if (name === null) return;
    project = renameGroup(project, groupId, name);
  }

  function handleAssignToGroup(elementIds, groupId) {
    recordUndo();
    project = assignElementsToGroup(project, elementIds, groupId);
    const group = (project.groups ?? []).find((g) => g.id === groupId);
    if (group?.collapsed) {
      project = toggleGroupCollapsed(project, groupId);
    }
    setSelection(elementIds);
  }

  function getAlignTargetIds() {
    if (timelineSelection.length > 0) return timelineSelection;
    if (selectedId) return [selectedId];
    return [];
  }

  function applyPositionPatches(patches) {
    for (const [id, pos] of patches) {
      updateElement(id, pos);
    }
  }

  function centerSelectionEach() {
    recordUndo();
    const ids = getAlignTargetIds();
    if (ids.length === 0) return;
    const els = project.elements.filter((e) => ids.includes(e.id));
    applyPositionPatches(
      centerElementsEach(els, project.canvasWidth, project.canvasHeight),
    );
  }

  function centerSelectionAsGroup() {
    recordUndo();
    const ids = getAlignTargetIds();
    if (ids.length === 0) return;
    const els = project.elements.filter((e) => ids.includes(e.id));
    applyPositionPatches(
      centerElementsAsGroup(els, project.canvasWidth, project.canvasHeight),
    );
  }

  function maxZIndex() {
    return project.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
  }

  function getSelectedElements() {
    const ids =
      timelineSelection.length > 0
        ? timelineSelection
        : selectedId
          ? [selectedId]
          : [];
    return ids
      .map((id) => project.elements.find((e) => e.id === id))
      .filter(Boolean);
  }

  function pasteAnchorEnd() {
    const ids =
      timelineSelection.length > 0
        ? timelineSelection
        : selectedId
          ? [selectedId]
          : [];
    if (ids.length === 0) return null;
    const ends = ids
      .map((id) => project.elements.find((e) => e.id === id)?.end ?? 0);
    return Math.max(...ends);
  }

  function placeAfterSelection(sources, pasted) {
    const anchorEnd = pasteAnchorEnd();
    if (anchorEnd == null) return pasted;

    const minSourceStart = Math.min(...sources.map((s) => s.start));
    const timeShift = anchorEnd - minSourceStart;
    const minClip = 0.2;

    return pasted.map((el, i) => {
      const dur = sources[i].end - sources[i].start;
      let start = clamp(el.start + timeShift, 0, project.duration);
      let end = clamp(start + dur, start + minClip, project.duration);
      if (end - start < minClip) {
        start = Math.max(0, end - dur);
        end = clamp(start + dur, start + minClip, project.duration);
      }
      return { ...el, start, end };
    });
  }

  function assignPastedToGroup(pasted) {
    const gid = groupIdForNewElement();
    if (!gid) return;
    project = assignElementsToGroup(
      project,
      pasted.map((p) => p.id),
      gid,
    );
    const group = (project.groups ?? []).find((g) => g.id === gid);
    if (group?.collapsed) {
      project = toggleGroupCollapsed(project, gid);
    }
  }

  async function copySelected() {
    const sources = getSelectedElements();
    if (sources.length === 0) return;
    clipboardElements = sources.map(elementToPlain);
    pasteCount = 0;
    try {
      await navigator.clipboard.writeText(serializeClipboard(clipboardElements));
    } catch {
      /* in-memory clipboard still works */
    }
  }

  function insertPastedElements(sources) {
    if (sources.length === 0) return;
    recordUndo();
    pasteCount += 1;
    let pasted = duplicateElements(sources, maxZIndex(), pasteCount);
    pasted = placeAfterSelection(sources, pasted);
    project.elements = [...project.elements, ...pasted];
    assignPastedToGroup(pasted);
    setSelection(pasted.map((p) => p.id));
  }

  async function pasteFromClipboard() {
    let sources = clipboardElements;
    if (sources.length === 0) {
      try {
        const text = await navigator.clipboard.readText();
        const parsed = parseClipboardText(text);
        if (parsed) sources = parsed;
      } catch {
        return;
      }
    }
    insertPastedElements(sources);
  }

  function duplicateSelected() {
    insertPastedElements(getSelectedElements().map(elementToPlain));
  }

  async function cutSelected() {
    const sources = getSelectedElements();
    if (sources.length === 0) return;
    await copySelected();
    for (const el of sources) deleteElement(el.id);
  }

  function onKeyDown(e) {
    if (isEditableTarget(e.target)) return;

    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      togglePlay();
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedId) {
          e.preventDefault();
          deleteElement(selectedId);
        }
      }
      return;
    }

    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
      return;
    }
    if (key === 'c') {
      if (!selectedId) return;
      e.preventDefault();
      copySelected();
    } else if (key === 'v') {
      e.preventDefault();
      pasteFromClipboard();
    } else if (key === 'x') {
      if (!selectedId) return;
      e.preventDefault();
      cutSelected();
    } else if (key === 'd') {
      if (!selectedId) return;
      e.preventDefault();
      duplicateSelected();
    }
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function onImagePick(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    recordUndo();
    const src = await readFileAsDataUrl(file);
    const el = defaultElement('image', project.duration, currentTime);
    el.src = src;
    el.label = file.name;
    el.zIndex = project.elements.length + 1;
    appendNewElement(el);
    e.currentTarget.value = '';
  }

  async function onVideoPick(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    recordUndo();
    const src = await readFileAsDataUrl(file);
    const el = defaultElement('video', project.duration, currentTime);
    el.src = src;
    el.label = file.name;
    el.zIndex = project.elements.length + 1;
    appendNewElement(el);
    e.currentTarget.value = '';
  }

  function tick(ts) {
    if (!isPlaying) return;
    const elapsed = (ts - playStart) / 1000;
    currentTime = (playFrom + elapsed) % project.duration;
    postPreviewTick();
    rafId = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (isPlaying) {
      isPlaying = false;
      cancelAnimationFrame(rafId);
      postPreviewSync();
    } else {
      isPlaying = true;
      playStart = performance.now();
      playFrom = currentTime;
      postPreviewSync();
      rafId = requestAnimationFrame(tick);
    }
  }

  function seek(t) {
    currentTime = clamp(t, 0, project.duration);
    if (isPlaying) {
      playFrom = currentTime;
      playStart = performance.now();
    }
    postPreviewSync();
  }

  function exportJson() {
    downloadFile(
      `${project.name.replace(/\s+/g, '-')}.json`,
      exportProjectJson(project),
      'application/json',
    );
  }

  function exportHtml() {
    downloadFile(
      `${project.name.replace(/\s+/g, '-')}.html`,
      exportStandaloneHtml(project),
      'text/html',
    );
  }

  function saveProject() {
    exportJson();
  }

  async function loadProjectFile(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        skipAutosave = true;
        project = normalizeProject({
          name: data.name ?? 'Imported',
          duration: data.duration ?? 10,
          canvasWidth: data.canvasWidth ?? 800,
          canvasHeight: data.canvasHeight ?? 600,
          elements: data.elements ?? [],
          groups: data.groups ?? [],
        });
        undoStack.clear();
        recordUndo();
        resetPlayback();
        if (activeProjectId) {
          await putProject(activeProjectId, project);
          await refreshProjectList();
        }
        skipAutosave = false;
        saveStatus = 'saved';
      } catch {
        alert('Invalid project file');
      }
    };
    reader.readAsText(file);
    e.currentTarget.value = '';
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="app">
  <header class="toolbar">
    <ProjectPicker
      projects={projectList}
      activeId={activeProjectId}
      {saveStatus}
      onSelect={selectProject}
      onNew={newProject}
      onDelete={deleteCurrentProject}
    />

    <input
      type="text"
      class="project-name"
      bind:value={project.name}
      aria-label="Project name"
      disabled={!dbReady}
    />

    <div class="group">
      <button
        type="button"
        onclick={copySelected}
        disabled={!selectedId}
        title="Copy (Ctrl+C)"
      >
        Copy
      </button>
      <button type="button" onclick={pasteFromClipboard} title="Paste (Ctrl+V)">Paste</button>
      <button type="button" onclick={() => addElement('text')}>+ Text</button>
      <button type="button" onclick={() => imageInput?.click()}>+ Image</button>
      <button type="button" onclick={() => videoInput?.click()}>+ Video</button>
      <input bind:this={imageInput} type="file" accept="image/*" onchange={onImagePick} />
      <input bind:this={videoInput} type="file" accept="video/*" onchange={onVideoPick} />
    </div>

    <div class="group">
      <label class="inline">
        Duration
        <input
          type="number"
          min="1"
          max="600"
          step="1"
          bind:value={project.duration}
          onchange={() => {
            currentTime = clamp(currentTime, 0, project.duration);
          }}
        />
      </label>
      <label class="inline" title="Left = fit timeline to panel width; right = zoom in">
        Zoom
        <input type="range" min="40" max="160" bind:value={pxPerSec} />
      </label>
    </div>

    <div class="group">
      <button type="button" disabled={!canUndo} onclick={undo} title="Undo (Ctrl+Z)">
        Undo
      </button>
      <button type="button" disabled={!canRedo} onclick={redo} title="Redo (Ctrl+Y)">
        Redo
      </button>
      <button type="button" class="primary" onclick={togglePlay}>
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button type="button" onclick={() => seek(0)}>|&lt;</button>
    </div>

    <div class="group spacer">
      <button type="button" onclick={saveProject}>Export JSON</button>
      <button type="button" onclick={() => jsonInput?.click()}>Import JSON</button>
      <input bind:this={jsonInput} type="file" accept="application/json,.json" onchange={loadProjectFile} />
      <button type="button" class="primary" onclick={exportHtml}>Export HTML</button>
    </div>
  </header>

  {#snippet timelineEditor(embedded = false)}
    <Timeline
      elements={project.elements}
      groups={project.groups ?? []}
      duration={project.duration}
      {currentTime}
      selectedIds={timelineSelection}
      {pxPerSec}
      {embedded}
      onSeek={seek}
      onSelect={selectFromTimeline}
      onSelectGroup={selectGroup}
      onUpdateTiming={updateTiming}
      onToggleGroup={handleToggleGroup}
      onCreateGroup={createGroupFromSelection}
      onUngroup={ungroupSelection}
      onDissolveGroup={handleDissolveGroup}
      onRenameGroup={handleRenameGroup}
      onAssignToGroup={handleAssignToGroup}
      onGestureStart={beginGesture}
      onGestureEnd={endGesture}
    />
  {/snippet}

  {#snippet propertiesEditor()}
    <PropertiesPanel
      element={selectedElement}
      selectionCount={timelineSelection.length || (selectedId ? 1 : 0)}
      onUpdate={updateElementFromPanel}
      onDelete={deleteElement}
      onCenterEach={centerSelectionEach}
      onCenterGroup={centerSelectionAsGroup}
    />
  {/snippet}

  <div class="workspace" class:popout-layout={previewPopoutOpen}>
    <main class="preview">
      <div class="preview-toolbar">
        {#if previewPopoutOpen}
          <span class="preview-hint">Preview is in a separate window</span>
          <button type="button" onclick={dockPreview}>Dock preview</button>
        {:else}
          <button type="button" onclick={popOutPreview} title="Open canvas preview in a new window">
            Pop out preview
          </button>
        {/if}
        {#if timelineSelection.length > 0 || selectedId}
          <span class="preview-toolbar-divider"></span>
          <button
            type="button"
            onclick={centerSelectionEach}
            title="Center selected element(s) on canvas"
          >
            Center
          </button>
          {#if timelineSelection.length > 1}
            <button
              type="button"
              onclick={centerSelectionAsGroup}
              title="Center selection as a group"
            >
              Center group
            </button>
          {/if}
        {/if}
      </div>
      {#if !previewPopoutOpen}
        <div class="preview-canvas">
          <Canvas
            elements={project.elements}
            {currentTime}
            {selectedId}
            width={project.canvasWidth}
            height={project.canvasHeight}
            onSelect={selectFromCanvas}
            onUpdate={updateElement}
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
          />
        </div>
      {:else}
        <div class="popout-editor">
          <div class="popout-editor-timeline">
            {@render timelineEditor(true)}
          </div>
          {@render propertiesEditor()}
        </div>
      {/if}
    </main>
    {#if !previewPopoutOpen}
      {@render propertiesEditor()}
    {/if}
  </div>

  {#if !previewPopoutOpen}
    {@render timelineEditor(false)}
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }

  .project-name {
    font-weight: 600;
    min-width: 120px;
    flex: 1;
    max-width: 180px;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .group.spacer {
    margin-left: auto;
  }

  .inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #aaa;
  }

  .inline input[type='number'] {
    width: 56px;
  }

  .workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .preview {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    background: #0a0a0a;
  }

  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
    background: #141414;
  }

  .preview-hint {
    font-size: 12px;
    color: #888;
  }

  .preview-toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    margin: 0 4px;
  }

  .preview-canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow: auto;
    min-height: 0;
  }

  .workspace.popout-layout .preview {
    background: var(--panel);
  }

  .popout-editor {
    flex: 1;
    display: flex;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .popout-editor-timeline {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
