import type { Project } from './types';
import { googleFontsLinkTagForProject } from './fonts';
import { exportGifRuntimeSource } from './gifPlayback';

export function exportProjectJson(project: Project): string {
  return JSON.stringify(project, null, 2);
}

export function exportStandaloneHtml(project: Project): string {
  const data = JSON.stringify(project);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(project.name)}</title>
  ${googleFontsLinkTagForProject(project)}
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    #viewport {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #000;
    }
    #scene-frame {
      position: relative;
      flex: 0 0 auto;
      overflow: hidden;
    }
    #scene-inner {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: top left;
    }
    #scene {
      position: relative;
      overflow: hidden;
      background: #000;
    }
    .scene-el {
      position: absolute;
      display: none;
      overflow: hidden;
    }
    .scene-el.visible { display: block; }
    .scene-el.text {
      white-space: pre-wrap;
      line-height: 1.25;
    }
    .scene-el .media {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center;
      display: block;
    }
  </style>
</head>
<body>
  <div id="viewport">
    <div id="scene-frame">
      <div id="scene-inner">
        <div id="scene"></div>
      </div>
    </div>
  </div>
  <script type="module">
    import { parseGIF, decompressFrames } from 'https://cdn.jsdelivr.net/npm/gifuct-js@2.1.2/+esm';

    ${exportGifRuntimeSource()}

    function resolveExportFontFamily(name) {
      return (name && String(name).trim()) || 'Inter, sans-serif';
    }

    function normalizeFontWeight(weight) {
      if (weight == null || weight === '') return '400';
      if (weight === 'normal') return '400';
      if (weight === 'bold') return '700';
      return String(weight);
    }

    const project = ${data};
    const natW = project.canvasWidth || 800;
    const natH = project.canvasHeight || 600;
    const viewport = document.getElementById('viewport');
    const sceneFrame = document.getElementById('scene-frame');
    const sceneInner = document.getElementById('scene-inner');
    const scene = document.getElementById('scene');
    scene.style.width = natW + 'px';
    scene.style.height = natH + 'px';
    sceneInner.style.width = natW + 'px';
    sceneInner.style.height = natH + 'px';

    function layoutScene() {
      const rect = viewport.getBoundingClientRect();
      const scale = Math.min(rect.width / natW, rect.height / natH);
      const scaledW = natW * scale;
      const scaledH = natH * scale;
      sceneFrame.style.width = scaledW + 'px';
      sceneFrame.style.height = scaledH + 'px';
      sceneInner.style.transform = 'scale(' + scale + ')';
    }

    new ResizeObserver(layoutScene).observe(viewport);
    window.addEventListener('resize', layoutScene);
    layoutScene();

    const media = [];
    /** @type {Map<string, { renderAtSceneTime: Function, drawToDisplay: Function }>} */
    const gifPlayers = new Map();

    async function loadGifPlayer(el, canvas, fallbackImg) {
      try {
        const buffer = await srcToArrayBuffer(el.src);
        const parsed = parseGIF(buffer);
        const frames = decompressFrames(parsed, true);
        if (frames.length === 0) return;
        const player = createGifPlayer(canvas, frames, parsed.lsd.width, parsed.lsd.height, el.width, el.height);
        gifPlayers.set(el.id, player);
        player.syncToSceneTime(lastSceneTime, el.start, el.playbackSpeed);
        if (fallbackImg) fallbackImg.style.visibility = 'hidden';
      } catch (err) {
        console.warn('GIF load failed', el.id, err);
      }
    }

    for (const el of project.elements) {
      const node = document.createElement('div');
      node.id = el.id;
      node.className = 'scene-el ' + el.type;
      node.style.left = el.x + 'px';
      node.style.top = el.y + 'px';
      node.style.width = el.width + 'px';
      node.style.height = el.height + 'px';
      node.style.zIndex = String(el.zIndex);

      if (el.type === 'text') {
        node.textContent = el.text || '';
        node.style.fontFamily = resolveExportFontFamily(el.fontFamily);
        node.style.fontSize = (el.fontSize || 24) + 'px';
        node.style.color = el.color || '#fff';
        node.style.fontWeight = normalizeFontWeight(el.fontWeight);
        node.style.fontSynthesis = 'none';
        if (el.rotation) {
          node.style.transform = 'rotate(' + el.rotation + 'deg)';
          node.style.transformOrigin = 'center center';
        }
      } else if (el.type === 'image') {
        if (isGifSrc(el.src)) {
          const img = document.createElement('img');
          img.className = 'media';
          img.src = el.src || '';
          img.alt = '';
          node.appendChild(img);
          const canvas = document.createElement('canvas');
          canvas.className = 'media';
          node.appendChild(canvas);
          loadGifPlayer(el, canvas, img);
        } else {
          const img = document.createElement('img');
          img.className = 'media';
          img.src = el.src || '';
          img.alt = '';
          node.appendChild(img);
        }
      } else if (el.type === 'video') {
        const vid = document.createElement('video');
        vid.className = 'media';
        vid.src = el.src || '';
        vid.muted = true;
        vid.playsInline = true;
        vid.loop = true;
        node.appendChild(vid);
        media.push({ el, vid, node });
      }

      scene.appendChild(node);
    }

    layoutScene();
    requestAnimationFrame(layoutScene);

    let startTs = null;
    let pausedAt = 0;
    let playing = true;
    let lastSceneTime = 0;

    function setTime(t) {
      const time = t % project.duration;
      lastSceneTime = time;
      for (const el of project.elements) {
        const node = document.getElementById(el.id);
        const visible = time >= el.start && time < el.end;
        node.classList.toggle('visible', visible);

        const player = gifPlayers.get(el.id);
        if (player && visible) {
          player.renderAtSceneTime(time, el.start, el.playbackSpeed);
          player.drawToDisplay();
        }
      }
      for (const { el, vid } of media) {
        const visible = time >= el.start && time < el.end;
        if (visible) {
          const local = scaledLocalTime(time, el.start, el.playbackSpeed);
          if (Math.abs(vid.currentTime - local) > 0.25) vid.currentTime = local;
          vid.play().catch(function () {});
        } else {
          vid.pause();
        }
      }
    }

    function frame(ts) {
      if (startTs === null) startTs = ts;
      if (playing) {
        const t = ((ts - startTs) / 1000 + pausedAt) % project.duration;
        setTime(t);
      }
      requestAnimationFrame(frame);
    }

    async function startPlayback() {
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch (_) {}
      }
      requestAnimationFrame(frame);
    }

    startPlayback();
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
