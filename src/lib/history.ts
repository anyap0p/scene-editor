import type { Project } from './types';
import { cloneProject } from './db';

const MAX_HISTORY = 50;

export function createUndoStack() {
  /** @type {Project[]} */
  let past = [];
  /** @type {Project[]} */
  let future = [];
  let recording = true;

  return {
    push(project: Project) {
      if (!recording) return;
      past.push(cloneProject(project));
      if (past.length > MAX_HISTORY) past.shift();
      future = [];
    },
    undo(current: Project): Project | null {
      if (past.length === 0) return null;
      future.push(cloneProject(current));
      return past.pop() ?? null;
    },
    redo(current: Project): Project | null {
      if (future.length === 0) return null;
      past.push(cloneProject(current));
      return future.pop() ?? null;
    },
    clear() {
      past = [];
      future = [];
    },
    setRecording(value: boolean) {
      recording = value;
    },
    canUndo() {
      return past.length > 0;
    },
    canRedo() {
      return future.length > 0;
    },
  };
}
