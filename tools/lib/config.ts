import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

/** Root of all jq-tools config: $TOOLS_CONFIG, else legacy $JQ_TOOLS_CONFIG, else ~/.config/jq-tools. */
export function toolsConfigRoot(): string {
  return (
    process.env.TOOLS_CONFIG ||
    process.env.JQ_TOOLS_CONFIG ||
    join(homedir(), '.config', 'jq-tools')
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

/** Deep-merge `over` onto `base`: plain objects merge key by key; arrays and scalars in `over` replace. Inputs are not mutated. */
function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return structuredClone(over);
  const out: Record<string, unknown> = structuredClone(base);
  for (const [k, v] of Object.entries(over)) out[k] = k in out ? deepMerge(out[k], v) : structuredClone(v);
  return out;
}

/**
 * Load `<root>/<tool>/config.yaml`, deep-merged over `defaults` (nested objects merge,
 * arrays are replaced). Creates the file from `defaults` when missing; never rewrites an existing file.
 */
export function loadToolConfig<T extends object>(tool: string, defaults: T): T {
  const dir = join(toolsConfigRoot(), tool);
  const file = join(dir, 'config.yaml');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, stringify(defaults), { flag: 'wx' });
    return structuredClone(defaults);
  }
  const parsed = parse(readFileSync(file, 'utf8'));
  const fromFile = isPlainObject(parsed) ? parsed : {};
  return deepMerge(defaults, fromFile) as T;
}

/** Tool-written state: `$XDG_STATE_HOME/jq-tools/<tool>`, else `~/.local/state/jq-tools/<tool>`. Created if needed. */
export function toolStateDir(tool: string): string {
  const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  const dir = join(base, 'jq-tools', tool);
  mkdirSync(dir, { recursive: true });
  return dir;
}
