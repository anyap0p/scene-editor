import type { SceneElement } from './types';

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function unionBounds(elements: SceneElement[]): Bounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Center one element on the canvas. */
export function centerElementOnCanvas(
  el: SceneElement,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number } {
  return {
    x: Math.round((canvasWidth - el.width) / 2),
    y: Math.round((canvasHeight - el.height) / 2),
  };
}

/** Center each element on the canvas independently. */
export function centerElementsEach(
  elements: SceneElement[],
  canvasWidth: number,
  canvasHeight: number,
): Map<string, { x: number; y: number }> {
  const out = new Map();
  for (const el of elements) {
    out.set(el.id, centerElementOnCanvas(el, canvasWidth, canvasHeight));
  }
  return out;
}

/** Move the selection so its bounding box is centered on the canvas. */
export function centerElementsAsGroup(
  elements: SceneElement[],
  canvasWidth: number,
  canvasHeight: number,
): Map<string, { x: number; y: number }> {
  const bounds = unionBounds(elements);
  const out = new Map();
  if (!bounds) return out;

  const dx = canvasWidth / 2 - (bounds.x + bounds.width / 2);
  const dy = canvasHeight / 2 - (bounds.y + bounds.height / 2);

  for (const el of elements) {
    out.set(el.id, {
      x: Math.round(el.x + dx),
      y: Math.round(el.y + dy),
    });
  }
  return out;
}
