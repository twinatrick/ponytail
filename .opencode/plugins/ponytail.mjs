import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '../..')

// In-memory session map keyed by sessionID (falls back to per-project hashed state file)
const sessionModes = new Map()

function projectHash(projectDir) {
  return crypto
    .createHash('sha256')
    .update(String(projectDir || REPO_ROOT))
    .digest('hex')
    .slice(0, 16)
}

function stateFileForProject(projectDir) {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'opencode', 'ponytail', `${projectHash(projectDir)}.json`)
}

function isSafeSessionKey(k) {
  return (
    typeof k === 'string' &&
    k.length > 0 &&
    k.length <= 128 &&
    k !== '__proto__' &&
    k !== 'constructor' &&
    k !== 'prototype'
  )
}

export function readProjectMode(projectDir, sessionID = null) {
  if (isSafeSessionKey(sessionID) && sessionModes.has(sessionID)) {
    return sessionModes.get(sessionID)
  }
  const file = stateFileForProject(projectDir)
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (
      isSafeSessionKey(sessionID) &&
      parsed &&
      typeof parsed.sessions === 'object' &&
      parsed.sessions !== null &&
      Object.hasOwn(parsed.sessions, sessionID) &&
      ['lite', 'full', 'ultra', 'off'].includes(parsed.sessions[sessionID])
    ) {
      return parsed.sessions[sessionID]
    }
    if (['lite', 'full', 'ultra', 'off'].includes(parsed?.defaultMode)) {
      return parsed.defaultMode
    }
  } catch {
    // default to full when uninitialized
  }
  return 'full'
}

export function writeProjectMode(projectDir, mode, sessionID = null) {
  const normalized = ['lite', 'full', 'ultra', 'off'].includes(mode) ? mode : 'full'
  if (isSafeSessionKey(sessionID)) {
    if (sessionModes.size >= 256 && !sessionModes.has(sessionID)) {
      const oldestKey = sessionModes.keys().next().value
      if (oldestKey !== undefined) sessionModes.delete(oldestKey)
    }
    sessionModes.set(sessionID, normalized)
  }
  const file = stateFileForProject(projectDir)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const safeSessions = Object.create(null)
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (parsed && typeof parsed.sessions === 'object' && parsed.sessions !== null) {
      for (const [k, v] of Object.entries(parsed.sessions)) {
        if (isSafeSessionKey(k) && ['lite', 'full', 'ultra', 'off'].includes(v)) {
          safeSessions[k] = v
        }
      }
    }
  } catch {
    // ignore missing or corrupt state file
  }
  if (isSafeSessionKey(sessionID)) {
    safeSessions[sessionID] = normalized
  }
  const keys = Object.keys(safeSessions)
  while (keys.length > 100) {
    const evict = keys.shift()
    if (evict) delete safeSessions[evict]
  }
  const payload = {
    defaultMode: normalized,
    sessions: safeSessions,
    updatedAt: new Date().toISOString(),
  }
  fs.writeFileSync(file, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 })
  return normalized
}

function loadSkillPrompt(mode) {
  if (mode === 'off') return ''
  const skillPath = path.join(REPO_ROOT, 'skills', 'ponytail', 'SKILL.md')
  try {
    const content = fs.readFileSync(skillPath, 'utf8')
    return `[Ponytail Mode: ${mode.toUpperCase()}]\n${content}`
  } catch {
    return `[Ponytail Mode: ${mode.toUpperCase()}]`
  }
}

function createHooks(projectDir) {
  return {
    'command.execute.before': async (input) => {
      if (input?.command !== 'ponytail') return
      const arg = String(input?.arguments || '').trim().split(/\s+/)[0]
      if (['lite', 'full', 'ultra', 'off'].includes(arg)) {
        writeProjectMode(projectDir, arg, input?.sessionID || null)
      }
    },
    'experimental.chat.system.transform': async (input, output) => {
      const sessionID = input?.sessionID || null
      const mode = readProjectMode(projectDir, sessionID)
      if (mode === 'off') return
      const prompt = loadSkillPrompt(mode)
      if (prompt && Array.isArray(output?.system)) {
        output.system.push(prompt)
      }
    },
    'experimental.session.compacting': async (input, output) => {
      const sessionID = input?.sessionID || null
      const mode = readProjectMode(projectDir, sessionID)
      if (mode === 'off') return
      if (Array.isArray(output?.context)) {
        output.context.push(`Ponytail active mode (${mode}) preserved across context compaction.`)
      }
    },
  }
}

const plugin = {
  id: 'ponytail-opencode',
  async setup(ctx) {
    const projectDir = ctx?.directory || ctx?.worktree || process.cwd()
    const hooks = createHooks(projectDir)
    if (ctx?.session?.hook) {
      await ctx.session.hook('context', (event) => {
        const mode = readProjectMode(projectDir, event?.sessionID || null)
        if (mode === 'off') return
        event.system.push({ type: 'text', text: loadSkillPrompt(mode) })
      })
      await ctx.session.hook('compaction', (event) => {
        const mode = readProjectMode(projectDir, event?.sessionID || null)
        if (mode === 'off') return
        event.system.push({ type: 'text', text: loadSkillPrompt(mode) })
      })
    }
    return hooks
  },
  async server(ctx = {}) {
    const projectDir = ctx?.directory || ctx?.worktree || process.cwd()
    return createHooks(projectDir)
  },
}

export const server = plugin.server
export default plugin
