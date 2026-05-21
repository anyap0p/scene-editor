import type { SceneElement } from './types';
import { newId } from './types';

export const CLIPBOARD_MIME = 'scene-editor/elements-v1';

const PASTE_OFFSET = 20;

export function elementToPlain(el: SceneElement): SceneElement {
  return JSON.parse(JSON.stringify(el));
}

export function duplicateElement(
  el: SceneElement,
  opts: { offsetX?: number; offsetY?: number; zIndex?: number } = {},
): SceneElement {
  const copy = elementToPlain(el);
  copy.id = newId();
  delete copy.groupId;
  copy.x = Math.round(copy.x + (opts.offsetX ?? PASTE_OFFSET));
  copy.y = Math.round(copy.y + (opts.offsetY ?? PASTE_OFFSET));
  if (opts.zIndex != null) copy.zIndex = opts.zIndex;
  const suffix = ' copy';
  if (!copy.label.endsWith(suffix)) copy.label += suffix;
  return copy;
}

export function duplicateElements(
  sources: SceneElement[],
  startZIndex: number,
  offsetMultiplier = 1,
): SceneElement[] {
  const ox = PASTE_OFFSET * offsetMultiplier;
  const oy = PASTE_OFFSET * offsetMultiplier;
  return sources.map((el, i) =>
    duplicateElement(el, {
      offsetX: ox,
      offsetY: oy,
      zIndex: startZIndex + i + 1,
    }),
  );
}

export function serializeClipboard(elements: SceneElement[]): string {
  return JSON.stringify({ [CLIPBOARD_MIME]: elements.map(elementToPlain) });
}

export function parseClipboardText(text: string): SceneElement[] | null {
  try {
    const data = JSON.parse(text);
    const list = data?.[CLIPBOARD_MIME];
    if (!Array.isArray(list) || list.length === 0) return null;
    return list as SceneElement[];
  } catch {
    return null;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}
