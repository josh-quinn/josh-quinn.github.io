/**
 * Task ids name a folder under `.gate/` and `tests/acceptance/`, so they hold no `/` and
 * cannot start with `.`. Ids read from `task/<id>-<slug>` branches also hold no `-`.
 */
const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function isTaskId(id: string): boolean {
  return TASK_ID.test(id);
}

export function assertTaskId(id: string): string {
  if (!isTaskId(id)) throw new Error(`invalid task id ${JSON.stringify(id)}: use letters, digits, '.', '_' or '-' (for example T1)`);
  return id;
}

/**
 * The task id of a `task/<id>-<slug>` (or `task/<id>`) branch, or null for any other branch.
 * Throws for a `task/` branch whose id is malformed, so it cannot slip past enforcement.
 */
export function taskIdFromBranch(branch: string): string | null {
  if (!branch.startsWith('task/')) return null;
  const m = /^task\/([^-/]+)(?:-.+)?$/.exec(branch);
  if (!m || !isTaskId(m[1])) throw new Error(`branch ${JSON.stringify(branch)} starts with task/ but does not match task/<id>-<slug>`);
  return m[1];
}
