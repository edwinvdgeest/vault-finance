import { CATEGORY_SETS, type Workspace } from '../types';
import { getCurrentWorkspace } from './storage';

/**
 * Returns the category list for the given workspace, or for the currently
 * active workspace when no argument is provided. Falls back to the personal
 * set for unknown workspaces so the UI never breaks.
 */
export function getCategories(ws?: Workspace | string): readonly string[] {
  const key = (ws ?? getCurrentWorkspace()) as Workspace;
  return CATEGORY_SETS[key] ?? CATEGORY_SETS.personal;
}
