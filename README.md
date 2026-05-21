# Scene Editor

A Twine-inspired **visual timeline editor** for single-page scenes: place text, images, and videos on a canvas, then control when each element appears and disappears on a video-editor-style timeline.

Built with **Svelte 5** + Vite.

## Run locally

```bash
cd scene-editor
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## How to use

1. **Add elements** — `+ Text`, `+ Image`, or `+ Video` in the toolbar.
2. **Canvas** — Drag elements to position them. Use the corner handle to resize. Only elements visible at the current time are shown.
3. **Timeline** — Each element has a track. Drag the **clip** to move it in time. Drag the **left/right edges** to trim when it appears/disappears. Click the ruler to scrub; use **Play** to preview.
4. **Properties** — Edit label, text, colors, start/end times, and z-index for the selected element.
5. **Export** — **Export HTML** downloads a self-contained page for Kindle/browser. **Save JSON** saves the project to reopen later with **Load JSON**.

## Kindle / offline

Exported HTML embeds images and videos as data URLs when you used file uploads, so a single `.html` file can work. Large videos make huge files — prefer GIFs or short clips for e-ink.

## Project layout

```
scene-editor/
  src/
    App.svelte           — main app state & toolbar
    components/
      Canvas.svelte      — draggable scene preview
      Timeline.svelte    — tracks & clip trimming
      PropertiesPanel.svelte
    lib/
      types.ts
      export.ts          — JSON + standalone HTML export
      time.ts
```
