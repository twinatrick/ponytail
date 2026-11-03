# ponytail-opencode (OpenCode V2 Hardened Edition)

Dedicated OpenCode V2 fork of [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) (pinned base commit `96608e078b2d5ea607c5c3b8b5a54d1c1fba6846`).

## Security, Privacy & OpenCode V2 Enhancements

1. **Project-Hashed & Session-Scoped Mode State (Fixes Cross-Session State Bleed)**:
   - Upstream Ponytail wrote the active mode to a single global file (`$XDG_CONFIG_HOME/opencode/.ponytail-active`), causing mode changes in one repository or session to overwrite all other repositories sharing `XDG_CONFIG_HOME`.
   - `ponytail-opencode` isolates persistent state per project directory hash at `$XDG_CONFIG_HOME/opencode/ponytail/<sha256(projectDir)>.json` (file mode `0600`, directory mode `0700`) and maintains an in-memory `Map<sessionID, mode>` per active session.
   - Safe when auditing repositories mounted read-only (`:ro`).

2. **Native OpenCode V2 Read-Only Review Subagent (`.opencode/agents/ponytail-review.md`)**:
   - Uses OpenCode V2 ordered `permissions` rules (`[{ action, resource, effect }]`) to enforce `deny` on `edit`, `shell`, `webfetch`, `websearch`, `subagent`, `external_directory`, and local secret/key files (`*.env`, `*.env.*`, `*.pem`, `*.key`, `*id_rsa*`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`).
   - Configured with `mode: all` so it can be invoked both directly (`opencode run --agent ponytail-review`) and via slash commands (`/ponytail-review`, `/ponytail-audit`, `/ponytail-debt`, `/ponytail-gain`).

3. **Non-Git Directory Walk Protection (`hooks/ponytail-map.js`)**:
   - Disables the un-gitignored 6-level recursive directory walk when `git ls-files` fails or runs outside a Git repository (unless `PONYTAIL_MAP_ALLOW_NONGIT=1` is explicitly set).

4. **Zero Non-OpenCode Host Residue or Telemetry**:
   - Removed `.claude-plugin/`, `hooks/band/`, `hooks/ponytail-band-import.js` (which scanned `~/.claude/projects/**/*.jsonl` transcripts), `.cursor-plugin/`, `.codex/`, `commands/*.toml`, `gemini-extension.json`, and legacy `.opencode/command/`.
