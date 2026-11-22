import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decide, respond, type Agent } from '../../../tools/gate/guard';

// Payload shapes as captured from the installed CLIs (ADR 0004), with paths replaced.
const ROOT = '/work/site';
const claude = (tool_name: string, tool_input: object) => ({
  session_id: 's', transcript_path: '/t.jsonl', cwd: ROOT, hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'u',
});
const copilot = (toolName: string, toolArgs: unknown) => ({ sessionId: 's', timestamp: 1, cwd: ROOT, toolCallId: 'c', toolName, toolArgs });
const agy = (name: string, args: object) => ({
  conversationId: 'c', cwd: ROOT, hookEventName: 'PreToolUse', stepIdx: 2, toolCall: { args, id: 'x', name }, workspacePaths: [ROOT],
});
const patch = (header: string) => `*** Begin Patch\n${header}\n+hi\n*** End Patch\n`;

const opts = (env: Record<string, string> = {}) => ({ root: ROOT, env });
const denied = (agent: Agent, payload: unknown, env?: Record<string, string>) => decide(agent, payload, opts(env)).deny;

describe('guard: protected paths', () => {
  it.each<[string, Agent, unknown]>([
    ['claude Write .gate/x (absolute)', 'claude', claude('Write', { file_path: `${ROOT}/.gate/x`, content: 'hi\n' })],
    ['claude Edit tests/acceptance', 'claude', claude('Edit', { file_path: `${ROOT}/tests/acceptance/T1/a.spec.ts`, old_string: 'a', new_string: 'b' })],
    ['claude MultiEdit relative', 'claude', claude('MultiEdit', { file_path: 'tests/acceptance/T1/a.spec.ts', edits: [] })],
    ['claude NotebookEdit', 'claude', claude('NotebookEdit', { notebook_path: `${ROOT}/.gate/n.ipynb`, new_source: '' })],
    ['claude Write with ../ normalisation', 'claude', claude('Write', { file_path: `${ROOT}/src/../.gate/T1/verdict.json`, content: '' })],
    ['claude Write with different case', 'claude', claude('Write', { file_path: `${ROOT}/Tests/Acceptance/T1/a.spec.ts`, content: '' })],
    ['claude Write to the .gate dir itself', 'claude', claude('Write', { file_path: `${ROOT}/.gate`, content: '' })],
    ['copilot apply_patch Add File', 'copilot', copilot('apply_patch', patch('*** Add File: .gate/x'))],
    ['copilot apply_patch Update File', 'copilot', copilot('apply_patch', patch('*** Update File: tests/acceptance/T1/a.spec.ts'))],
    ['copilot apply_patch Delete File', 'copilot', copilot('apply_patch', patch('*** Delete File: tests/acceptance/T1/a.spec.ts'))],
    ['copilot apply_patch Move to', 'copilot', copilot('apply_patch', '*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: .gate/a.ts\n*** End Patch\n')],
    ['copilot edit tool with path', 'copilot', copilot('edit', { path: `${ROOT}/.gate/x`, old_str: 'a', new_str: 'b' })],
    ['copilot create tool with path', 'copilot', copilot('create', { path: '.gate/x', file_text: 'hi' })],
    ['agy write_file (1.5.9)', 'agy', agy('write_file', { Content: 'hi', Overwrite: true, Path: `${ROOT}/.gate/x` })],
    ['agy write_to_file (docs)', 'agy', agy('write_to_file', { TargetFile: `${ROOT}/tests/acceptance/T1/a.spec.ts`, CodeContent: 'x' })],
    ['agy replace_file_content', 'agy', agy('replace_file_content', { TargetFile: `${ROOT}/.gate/x`, TargetContent: 'a', ReplacementContent: 'b' })],
    ['unknown tool mentioning a protected path', 'claude', claude('mcp__fs__write', { target: `${ROOT}/.gate/x`, data: 'hi' })],
  ])('denies %s', (_label, agent, payload) => {
    expect(denied(agent, payload)).toBe(true);
  });

  it.each<[string, Agent, unknown]>([
    ['claude Write src/', 'claude', claude('Write', { file_path: `${ROOT}/src/a.ts`, content: 'mentions .gate/ and tests/acceptance/ in content' })],
    ['claude Write look-alike .gatex/', 'claude', claude('Write', { file_path: `${ROOT}/.gatex/a`, content: '' })],
    ['claude Write tests/unit', 'claude', claude('Write', { file_path: `${ROOT}/tests/unit/gate/x.test.ts`, content: '' })],
    ['claude Write outside the repo', 'claude', claude('Write', { file_path: '/elsewhere/.gate/x', content: '' })],
    ['claude Read of a verdict', 'claude', claude('Read', { file_path: `${ROOT}/.gate/T1/verdict.json` })],
    ['claude Grep in acceptance tests', 'claude', claude('Grep', { pattern: 'x', path: `${ROOT}/tests/acceptance` })],
    ['copilot view of acceptance tests', 'copilot', copilot('view', { path: `${ROOT}/tests/acceptance/T1/a.spec.ts` })],
    ['copilot apply_patch to src', 'copilot', copilot('apply_patch', patch('*** Add File: src/x.ts'))],
    ['agy view_file of a verdict', 'agy', agy('view_file', { AbsolutePath: `${ROOT}/.gate/T1/verdict.json` })],
    ['agy write_file to src', 'agy', agy('write_file', { Content: 'hi', Path: `${ROOT}/src/x` })],
  ])('allows %s', (_label, agent, payload) => {
    expect(denied(agent, payload)).toBe(false);
  });
});

describe('guard: test-author override', () => {
  const write = claude('Write', { file_path: `${ROOT}/tests/acceptance/T1/a.spec.ts`, content: '' });
  it('allows tests/acceptance/<id>/ writes when GATE_TEST_AUTHOR=<id>', () => {
    expect(denied('claude', write, { GATE_TEST_AUTHOR: 'T1' })).toBe(false);
  });
  it('still denies another task folder', () => {
    expect(denied('claude', write, { GATE_TEST_AUTHOR: 'T2' })).toBe(true);
  });
  it('still denies .gate/', () => {
    expect(denied('claude', claude('Write', { file_path: `${ROOT}/.gate/T1/verdict.json`, content: '' }), { GATE_TEST_AUTHOR: 'T1' })).toBe(true);
  });
  it('ignores an invalid override value', () => {
    expect(denied('claude', write, { GATE_TEST_AUTHOR: '../T1' })).toBe(true);
  });
});

describe('guard: shell commands', () => {
  const sh = (command: string, agent: Agent = 'claude') =>
    agent === 'claude'
      ? claude('Bash', { command, description: 'd' })
      : agent === 'copilot'
        ? copilot('bash', { command, description: 'd' })
        : agy('run_command', { CommandLine: command, WaitMsBeforeAsync: 5000 });

  it.each([
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -nm x',
    'git commit -anm "msg"',
    'git push --no-verify',
    'git push -n origin HEAD',
    'git -C . commit --no-verify -m x',
    'npm test && git commit --no-verify -m x',
    'LEFTHOOK=0 git push',
    'git -c core.hooksPath=/dev/null push',
    "bash -c 'git commit --no-verify -m x'",
    'echo hi > .gate/x',
    'cat >> tests/acceptance/T1/a.spec.ts <<EOF\nx\nEOF',
    'rm -rf .gate/T1',
    'mv src/a.ts tests/acceptance/T1/a.spec.ts',
    'cp /tmp/v.json .gate/T1/verdict.json',
    'tee .gate/T1/verdict.json < /tmp/v',
    "sed -i '' s/a/b/ tests/acceptance/T1/a.spec.ts",
    'git checkout -- tests/acceptance/T1/a.spec.ts',
    "node -e \"require('fs').writeFileSync('.gate/T1/verdict.json','{}')\"",
    'cd .gate && rm -rf T1',
    "sh -c 'echo x > .gate/x'",
    'git commit -m "test: a" -m "Gate-Test-Author: T1"',
    'git commit --trailer "Gate-Test-Author: T1" -m x',
    'export LEFTHOOK=0; git push',
    'env LEFTHOOK=0 git push',
    'git config core.hooksPath /dev/null',
    "node <<'JS'\nrequire('fs').writeFileSync('.gate/T1/verdict.json', '{}')\nJS",
    'bash <<EOF\nrm -rf .gate/T1\nEOF',
    'cat <<< "x" > .gate/x',
    'cat <<-EOF > .gate/x\n\tx\n\tEOF\necho done',
  ])('denies %j', (command) => {
    for (const agent of ['claude', 'copilot', 'agy'] as Agent[]) expect(denied(agent, sh(command, agent)), agent).toBe(true);
  });

  it.each([
    'git status --short',
    'git commit -m "fix -n handling"',
    'git commit -m x',
    'git push origin HEAD',
    'git add .gate/T1',
    'git log -n 5',
    'cat .gate/T1/verdict.json',
    'ls tests/acceptance/T1',
    'npx playwright test tests/acceptance/T1/',
    'npm run gate -- task T1',
    'npm run gate -- verify T1',
    'grep -rn no-verify docs/',
    'echo hi > src/x.txt',
    // Text that only mentions the bypasses (docs, heredoc bodies, searches) is not a bypass.
    "cat > docs/note.md <<'EOF'\nNever use LEFTHOOK=0, core.hooksPath or git commit --no-verify.\nEOF",
    "python3 - <<'EOF'\nopen('docs/x.md','w').write('LEFTHOOK=0 and core.hooksPath and --no-verify')\nEOF",
    'grep -rn core.hooksPath docs/',
    'echo LEFTHOOK=0',
    'grep -c x <<< "LEFTHOOK=0"',
    "cat > docs/a.md <<'A'\nrm -rf .gate/T1\nA\ncat > docs/b.md <<'B'\ngit push --no-verify\nB",
  ])('allows %j', (command) => {
    for (const agent of ['claude', 'copilot', 'agy'] as Agent[]) expect(denied(agent, sh(command, agent)), agent).toBe(false);
  });

  it('lets the test author commit with the trailer for its own task', () => {
    expect(denied('claude', sh('git commit -m "test: a" -m "Gate-Test-Author: T1"'), { GATE_TEST_AUTHOR: 'T1' })).toBe(false);
    expect(denied('claude', sh('git commit -m "test: a" -m "Gate-Test-Author: T2"'), { GATE_TEST_AUTHOR: 'T1' })).toBe(true);
  });
});

describe('guard: malformed input', () => {
  it('denies (fails closed) when the payload has no tool', () => {
    expect(denied('claude', {})).toBe(true);
    expect(denied('copilot', null)).toBe(true);
  });
});

describe('guard: respond', () => {
  const deny = { deny: true as const, reason: 'gate: no' };
  it('claude: exit 2 with the reason on stderr', () => {
    expect(respond('claude', deny)).toEqual({ exitCode: 2, stdout: '', stderr: 'gate: no\n' });
    expect(respond('claude', { deny: false })).toEqual({ exitCode: 0, stdout: '', stderr: '' });
  });
  it('copilot: permissionDecision deny JSON on stdout', () => {
    const r = respond('copilot', deny);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ permissionDecision: 'deny', permissionDecisionReason: 'gate: no' });
    expect(respond('copilot', { deny: false }).stdout).toBe('');
  });
  it('agy: decision deny JSON on stdout', () => {
    const r = respond('agy', deny);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ decision: 'deny', reason: 'gate: no' });
    expect(respond('agy', { deny: false }).stdout).toBe('');
  });
});

describe('guard: as a hook process (node, no tsx)', () => {
  const script = resolve('tools/gate/guard.ts');
  const run = (agent: string, payload: unknown) =>
    spawnSync(process.execPath, [script, '--agent', agent], { input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, GATE_TEST_AUTHOR: '' } });

  it('blocks a claude Write to .gate/ with exit 2', () => {
    const r = run('claude', { ...claude('Write', { file_path: `${process.cwd()}/.gate/x`, content: '' }), cwd: process.cwd() });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/\.gate/);
  });
  it('allows a claude Read with exit 0 and no output', () => {
    const r = run('claude', { ...claude('Read', { file_path: `${process.cwd()}/.gate/x` }), cwd: process.cwd() });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });
  it('prints copilot deny JSON', () => {
    const r = run('copilot', { ...copilot('apply_patch', patch('*** Add File: .gate/x')), cwd: process.cwd() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).permissionDecision).toBe('deny');
  });
  it('fails closed on an unknown agent and on bad JSON', () => {
    expect(run('nope', {}).status).toBe(2);
    const bad = spawnSync(process.execPath, [script, '--agent', 'claude'], { input: '{oops', encoding: 'utf8' });
    expect(bad.status).toBe(2);
  });
});
