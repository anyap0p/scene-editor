<script>
  import { onMount } from 'svelte';
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
  } from './lib/groups';

  let project = $state(defaultProject());
  let activeProjectId = $state(null);
  let projectList = $state([]);
  let saveStatus = $state('idle');
  let dbReady = $state(false);
  let skipAutosave = $state(true);

  let currentTime = $state(0);
  let selectedId = $state(null);
  let timelineSelection = $state([]);
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

  async function refreshProjectList() {
    projectList = await listProjectMetas();
  }

  function resetPlayback() {
    currentTime = 0;
    selectedId = null;
    timelineSelection = [];
    isPlaying = false;
    cancelAnimationFrame(rafId);
  }

  function setSelection(ids) {
    timelineSelection = ids;
    selectedId = ids.length > 0 ? ids[ids.length - 1] : null;
  }

  function selectFromTimeline(id, additive = false) {
    if (!id) {
      setSelection([]);
      return;
    }
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
    setSelection(id ? [id] : []);
  }

  function selectGroup(groupId) {
    const ids = project.elements.filter((e) => e.groupId === groupId).map((e) => e.id);
    setSelection(ids);
  }

  async function loadProjectById(id) {
    const stored = await getProject(id);
    if (!stored) return false;
    skipAutosave = true;
    activeProjectId = id;
    setActiveId(id);
    project = normalizeProject(stored.project);
    resetPlayback();
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

  onMount(async () => {
    try {
      const id = await ensureProjects();
      await refreshProjectList();
      await loadProjectById(id);
      dbReady = true;
    } catch (err) {
      console.error('Failed to open local database', err);
      alert('Could not open local project storage. Changes will not be saved.');
      dbReady = true;
      skipAutosave = false;
    }
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

  function updateElement(id, patch) {
    project.elements = project.elements.map((el) =>
      el.id === id ? { ...el, ...patch } : el,
    );
  }

  function updateTiming(id, start, end) {
    const s = clamp(start, 0, project.duration);
    const e = clamp(end, s + 0.1, project.duration);
    updateElement(id, { start: s, end: e });
  }

  function addElement(type) {
    const el = defaultElement(type, project.duration);
    el.zIndex = project.elements.length + 1;
    project.elements = [...project.elements, el];
    selectedId = el.id;
  }

  function deleteElement(id) {
    project.elements = project.elements.filter((e) => e.id !== id);
    setSelection(timelineSelection.filter((sid) => sid !== id));
  }

  function createGroupFromSelection() {
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
    project = dissolveGroup(project, groupId);
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

  function maxZIndex() {
    return project.elements.reduce((m, e) => Math.max(m, e.zIndex), 0);
  }

  function getSelectedElements() {
    if (!selectedId) return [];
    const el = project.elements.find((e) => e.id === selectedId);
    return el ? [el] : [];
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
    pasteCount += 1;
    const pasted = duplicateElements(sources, maxZIndex(), pasteCount);
    project.elements = [...project.elements, ...pasted];
    selectedId = pasted[pasted.length - 1].id;
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
    const src = await readFileAsDataUrl(file);
    const el = defaultElement('image', project.duration);
    el.src = src;
    el.label = file.name;
    el.zIndex = project.elements.length + 1;
    project.elements = [...project.elements, el];
    selectedId = el.id;
    e.currentTarget.value = '';
  }

  async function onVideoPick(e) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const src = await readFileAsDataUrl(file);
    const el = defaultElement('video', project.duration);
    el.src = src;
    el.label = file.name;
    el.zIndex = project.elements.length + 1;
    project.elements = [...project.elements, el];
    selectedId = el.id;
    e.currentTarget.value = '';
  }

  function tick(ts) {
    if (!isPlaying) return;
    const elapsed = (ts - playStart) / 1000;
    currentTime = (playFrom + elapsed) % project.duration;
    rafId = requestAnimationFrame(tick);
  }

  function togglePlay() {
    if (isPlaying) {
      isPlaying = false;
      cancelAnimationFrame(rafId);
    } else {
      isPlaying = true;
      playStart = performance.now();
      playFrom = currentTime;
      rafId = requestAnimationFrame(tick);
    }
  }

  function seek(t) {
    currentTime = clamp(t, 0, project.duration);
    if (isPlaying) {
      playFrom = currentTime;
      playStart = performance.now();
    }
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
      <label class="inline">
        Zoom
        <input type="range" min="40" max="160" bind:value={pxPerSec} />
      </label>
    </div>

    <div class="group">
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

  <div class="workspace">
    <main class="preview">
      <Canvas
        elements={project.elements}
        {currentTime}
        {selectedId}
        width={project.canvasWidth}
        height={project.canvasHeight}
        onSelect={selectFromCanvas}
        onUpdate={updateElement}
      />
    </main>
    <PropertiesPanel
      element={selectedElement}
      onUpdate={updateElement}
      onDelete={deleteElement}
    />
  </div>

  <Timeline
    elements={project.elements}
    groups={project.groups ?? []}
    duration={project.duration}
    {currentTime}
    selectedIds={timelineSelection}
    {pxPerSec}
    onSeek={seek}
    onSelect={selectFromTimeline}
    onSelectGroup={selectGroup}
    onUpdateTiming={updateTiming}
    onToggleGroup={handleToggleGroup}
    onCreateGroup={createGroupFromSelection}
    onUngroup={ungroupSelection}
    onDissolveGroup={handleDissolveGroup}
    onRenameGroup={handleRenameGroup}
  />
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100%;
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
  }

  .preview {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    overflow: auto;
    background: #0a0a0a;
  }
</style>
