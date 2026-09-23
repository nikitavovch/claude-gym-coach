#!/usr/bin/env node
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// fileURLToPath, not URL.pathname: the latter yields "/C:/..." on
// Windows, which no fs call can use.
const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || fileURLToPath(new URL('..', import.meta.url));

function exportPluginRoot() {
  const envFile = process.env.CLAUDE_ENV_FILE;
  if (!envFile) return;
  try {
    // Single quotes: the env file is sourced by a shell, and JSON.stringify
    // would leave $() and backticks in the path live.
    appendFileSync(envFile, `export COACH_PLUGIN_ROOT='${pluginRoot.replace(/'/g, "'\\''")}'\n`);
  } catch {
    // an unwritable env file must not break the session
  }
}

// Resolves each athlete's gym per .coach.json's `gym` field: "own" reads
// only athletes/<id>/gym.md, and if that file is missing there is no fallback
// to the shared gym — a wrong equipment substitution is worse than the
// coach asking first, so the roster note says the inventory is unknown
// instead. "shared" (default) uses the root gym.md. Returns a roster note
// per athlete and the distinct inventory blocks to print, each labelled
// with who it serves.
function resolveGym(config) {
  const sharedPath = join(projectDir, 'gym.md');
  const sharedText = existsSync(sharedPath) ? readFileSync(sharedPath, 'utf8').trim() : null;

  const notes = {};
  const sharedUsers = [];
  const ownBlocks = [];

  for (const [id, a] of Object.entries(config.athletes ?? {})) {
    // An id is a path segment; one that isn't a slug is never read from
    // (stats.mjs refuses the folder and the hook prints its one warning).
    if (a.gym === 'own' && !/^[a-z0-9][a-z0-9_-]*$/.test(id)) {
      notes[id] = 'gym own, unreadable id';
    } else if (a.gym === 'own') {
      const ownPath = join(projectDir, 'athletes', id, 'gym.md');
      if (existsSync(ownPath)) {
        ownBlocks.push([id, readFileSync(ownPath, 'utf8').trim()]);
        notes[id] = 'gym own';
      } else {
        notes[id] = 'gym own, no file — ask before suggesting equipment';
      }
    } else {
      sharedUsers.push(id);
      notes[id] = sharedText ? 'gym shared' : 'gym shared, no file';
    }
  }

  const blocks = [];
  if (sharedUsers.length && sharedText) {
    blocks.push([`shared (${sharedUsers.join(', ')})`, sharedText]);
  }
  for (const [id, text] of ownBlocks) {
    blocks.push([`${id}'s own gym`, text]);
  }

  return { notes, blocks };
}

function main() {
  exportPluginRoot();

  if (!existsSync(join(projectDir, '.coach.json'))) return;

  const parts = [];

  try {
    // The persona names plugin files as ${CLAUDE_PLUGIN_ROOT}/...; hook
    // output is not a skill, so nothing else would fill the path in, and a
    // Read tool cannot expand a variable.
    const root = pluginRoot.replace(/[\\/]+$/, '');
    parts.push(readFileSync(join(pluginRoot, 'hooks', 'persona.md'), 'utf8').trim().replaceAll('${CLAUDE_PLUGIN_ROOT}', root));
  } catch (e) {
    // Losing the persona loses the safety rules with it; that is a warning,
    // and the fallback still points at them.
    parts.push(`You are the gym coach for this folder. Be brief and factual. Follow ${join(pluginRoot, 'knowledge', 'safety.md')} exactly on pain, diagnosis and medication.`);
    parts.push(`warning: cannot read the coach persona (${e.message.split('\n')[0]})`);
  }

  // Skills and agents get the plugin's path from Claude Code itself
  // (${CLAUDE_PLUGIN_ROOT} in their text). This line, like the
  // COACH_PLUGIN_ROOT export above, is for commands the athlete runs by
  // hand — `stats.mjs validate`, `export` — when no env file was offered.
  parts.push(`plugin root: ${pluginRoot}`);

  let configOk = false;
  try {
    const config = JSON.parse(readFileSync(join(projectDir, '.coach.json'), 'utf8'));
    const { notes, blocks } = resolveGym(config);

    const rows = Object.entries(config.athletes ?? {}).map(
      ([id, a]) => `- ${id}: ${a.name ?? id}, language ${a.language ?? config.language ?? 'en'}, motivation ${a.motivation ? 'on' : 'off'}, ${notes[id]}${id === config.default_athlete ? ' (default)' : ''}`
    );
    if (rows.length) parts.push(`## Athletes\n${rows.join('\n')}`);

    for (const [title, text] of blocks) {
      parts.push(`## Gym inventory — ${title}\n${text}`);
    }
    configOk = true;
  } catch (e) {
    parts.push(`warning: cannot read .coach.json (${e.message})`);
  }

  // A broken .coach.json already produced one warning above; stats.mjs
  // would only fail on the same root cause, so skip it rather than
  // printing a second warning about the same problem.
  if (configOk) {
    try {
      // spawnSync (not execFileSync) so stats.mjs's stderr is captured
      // rather than inherited straight to the terminal, which would
      // bypass the one-warning-per-failure contract below.
      const result = spawnSync(
        process.execPath,
        [join(pluginRoot, 'scripts', 'stats.mjs'), 'brief', '--dir', projectDir],
        { encoding: 'utf8', timeout: 5000 }
      );
      if (result.error) throw result.error;
      // Node prints a crash as its source location first; the line that
      // names the error is the one worth a warning.
      const errLines = (result.stderr || '').trim().split('\n');
      const stderrLine = errLines.find((l) => /^\s*\w*Error: /.test(l))?.trim() ?? errLines[0];
      if (result.status !== 0) {
        parts.push(`warning: cannot read training stats (${stderrLine || `exit ${result.status}`})`);
      } else {
        const brief = (result.stdout || '').trim();
        if (brief) parts.push(`## Current state\n${brief}`);
        if (stderrLine) parts.push(`warning: training stats reported an issue (${stderrLine})`);
      }
    } catch (e) {
      parts.push(`warning: cannot read training stats (${e.message.split('\n')[0]})`);
    }
  }

  process.stdout.write(parts.join('\n\n') + '\n');
}

// Nothing the reader does may fail the session — not even closing early.
process.stdout.on('error', () => {});

try {
  main();
} catch (e) {
  process.stdout.write(`warning: coach hook failed (${e.message})\n`);
}
// exitCode rather than an explicit process.exit, which dropped whatever of
// a long output was still queued for the pipe (see stats.mjs). Nothing here
// is asynchronous, so the process ends as soon as stdout drains.
process.exitCode = 0;
