// Renders agents/src/*.md into Claude Code and Copilot CLI agent files.
// Run: npm run agents:sync
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';

export interface OutDirs {
  claude: string;
  copilot: string;
}

// Source files use Claude tool names; Copilot uses lowercase aliases (ADR 0004).
const COPILOT_ALIAS: Record<string, string> = {
  Read: 'read',
  Write: 'edit',
  Edit: 'edit',
  Grep: 'search',
  Glob: 'search',
  Bash: 'execute',
};

interface AgentSource {
  name: string;
  description: string;
  tools: string[];
  body: string;
}

function parseSource(file: string, text: string): AgentSource {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n?/g, '\n'));
  if (!m) throw new Error(`${file}: missing frontmatter`);
  let fm: Record<string, unknown>;
  try {
    const parsed: unknown = parse(m[1]);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('frontmatter must be a YAML mapping');
    }
    fm = parsed as Record<string, unknown>;
  } catch (e) {
    throw new Error(`${file}: invalid frontmatter: ${(e as Error).message}`);
  }
  const { name, description, tools } = fm;
  if (typeof name !== 'string' || typeof description !== 'string') {
    throw new Error(`${file}: frontmatter needs string name and description`);
  }
  if (!Array.isArray(tools) || tools.some((t) => typeof t !== 'string')) {
    throw new Error(`${file}: frontmatter tools must be a list of names`);
  }
  for (const t of tools as string[]) {
    if (!(t in COPILOT_ALIAS)) throw new Error(`${file}: unknown tool "${t}"`);
  }
  return { name, description, tools: tools as string[], body: m[2].replace(/^\n+/, '') };
}

function render(
  fm: Record<string, unknown>,
  srcName: string,
  body: string,
): string {
  const yaml = stringify(fm, { lineWidth: 0 }).trimEnd();
  const note = `<!-- generated from agents/src/${srcName} — do not edit -->`;
  return `---\n${yaml}\n---\n${note}\n\n${body}`;
}

function writeIfChanged(path: string, content: string): void {
  if (existsSync(path) && readFileSync(path, 'utf8') === content) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

const GENERATED_RE = /^<!-- generated from agents\/src\/([^\s>]+\.md) — do not edit -->$/m;

// Remove generated files (identified by our header) whose source no longer exists.
// Files without the header are hand-written and never touched.
function pruneStale(dir: string, suffix: string, keep: Set<string>, srcFiles: Set<string>): void {
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(suffix)) continue;
    const path = join(dir, f);
    if (keep.has(path)) continue;
    const m = GENERATED_RE.exec(readFileSync(path, 'utf8'));
    if (m && !srcFiles.has(m[1])) unlinkSync(path);
  }
}

export function syncAgents(srcDir: string, outDirs: OutDirs): string[] {
  const written: string[] = [];
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.md')).sort();
  for (const file of files) {
    const a = parseSource(file, readFileSync(join(srcDir, file), 'utf8'));
    const claudePath = join(outDirs.claude, `${a.name}.md`);
    const copilotPath = join(outDirs.copilot, `${a.name}.agent.md`);
    writeIfChanged(
      claudePath,
      render(
        { name: a.name, description: a.description, tools: a.tools.join(', ') },
        file,
        a.body,
      ),
    );
    writeIfChanged(
      copilotPath,
      render(
        {
          name: a.name,
          description: a.description,
          tools: [...new Set(a.tools.map((t) => COPILOT_ALIAS[t]))],
        },
        file,
        a.body,
      ),
    );
    written.push(claudePath, copilotPath);
  }
  const keep = new Set(written);
  const srcFiles = new Set(files);
  pruneStale(outDirs.claude, '.md', keep, srcFiles);
  pruneStale(outDirs.copilot, '.agent.md', keep, srcFiles);
  return written;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const paths = syncAgents(join(repo, 'agents', 'src'), {
    claude: join(repo, '.claude', 'agents'),
    copilot: join(repo, '.github', 'agents'),
  });
  for (const p of paths) console.log(p.replace(repo + '/', ''));
}
