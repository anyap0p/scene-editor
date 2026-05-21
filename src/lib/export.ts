import type { Project } from './types';

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
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
    }
    #scene {
      position: relative;
      overflow: hidden;
      background: #000;
    }
    .scene-el {
      position: absolute;
      display: none;
    }
    .scene-el.visible { display: block; }
    .scene-el.text {
      white-space: pre-wrap;
      line-height: 1.25;
    }
    .scene-el img, .scene-el video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
  </style>
</head>
<body>
  <div id="scene"></div>
  <script>
    const project = ${data};
    const scene = document.getElementById('scene');
    scene.style.width = project.canvasWidth + 'px';
    scene.style.height = project.canvasHeight + 'px';

    const media = [];

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
        node.style.fontSize = (el.fontSize || 24) + 'px';
        node.style.color = el.color || '#fff';
        node.style.fontWeight = el.fontWeight || 'normal';
      } else if (el.type === 'image') {
        const img = document.createElement('img');
        img.src = el.src || '';
        img.alt = '';
        node.appendChild(img);
      } else if (el.type === 'video') {
        const vid = document.createElement('video');
        vid.src = el.src || '';
        vid.muted = true;
        vid.playsInline = true;
        vid.loop = true;
        node.appendChild(vid);
        media.push({ el, vid, node });
      }

      scene.appendChild(node);
    }

    let startTs = null;
    let pausedAt = 0;
    let playing = true;

    function setTime(t) {
      const time = t % project.duration;
      for (const el of project.elements) {
        const node = document.getElementById(el.id);
        const visible = time >= el.start && time < el.end;
        node.classList.toggle('visible', visible);
      }
      for (const { el, vid, node } of media) {
        const visible = time >= el.start && time < el.end;
        if (visible) {
          const local = time - el.start;
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

    requestAnimationFrame(frame);
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
