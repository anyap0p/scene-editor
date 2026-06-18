import type { SceneElement } from './types';
import type { ElementCrop } from './crop';

export const PREVIEW_CHANNEL = 'scene-editor-preview';

export type PreviewSyncMessage =
  | { type: 'ready' }
  | {
      type: 'sync';
      elements: SceneElement[];
      currentTime: number;
      selectedId: string | null;
      canvasWidth: number;
      canvasHeight: number;
      duration: number;
      isPlaying: boolean;
      playbackStartedAt: number;
      playFrom: number;
      cropEditingId: string | null;
      cropEditDraft: ElementCrop | null;
    }
  | { type: 'tick'; currentTime: number; playbackStartedAt: number; playFrom: number }
  | { type: 'select'; id: string | null }
  | { type: 'update'; id: string; patch: Partial<SceneElement> }
  | { type: 'cropDraft'; crop: ElementCrop | null }
  | { type: 'cropConfirm' }
  | { type: 'cropCancel' }
  | { type: 'seek'; time: number }
  | { type: 'play'; playing: boolean };

export function openPreviewPopout(): Window | null {
  const url = new URL(location.href);
  url.searchParams.set('popout', '1');
  return window.open(
    url.toString(),
    'scene-editor-preview',
    'width=920,height=740,menubar=no,toolbar=no,location=no,status=no',
  );
}

export function isPopoutMode(): boolean {
  return new URLSearchParams(location.search).get('popout') === '1';
}
