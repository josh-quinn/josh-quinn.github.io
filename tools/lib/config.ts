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

/**
 * Load `<root>/<tool>/config.yaml`, merged over `defaults`.
 * Creates the file from `defaults` when missing; never rewrites an existing file.
 */
export function loadToolConfig<T extends object>(tool: string, defaults: T): T {
  const dir = join(toolsConfigRoot(), tool);
  const file = join(dir, 'config.yaml');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, stringify(defaults), { flag: 'wx' });
    return { ...defaults };
  }
  const parsed = parse(readFileSync(file, 'utf8'));
  const fromFile = parsed && typeof parsed === 'object' ? parsed : {};
  return { ...defaults, ...fromFile } as T;
}

/** Tool-written state: `$XDG_STATE_HOME/jq-tools/<tool>`, else `~/.local/state/jq-tools/<tool>`. Created if needed. */
export function toolStateDir(tool: string): string {
  const base = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state');
  const dir = join(base, 'jq-tools', tool);
  mkdirSync(dir, { recursive: true });
  return dir;
}
