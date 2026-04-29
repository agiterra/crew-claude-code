# Crew

Multi-agent orchestration for Claude Code. Launch agents in persistent screen sessions, arrange them in terminal panes with themed backgrounds, and communicate between them.

Supports both **[cmux](https://cmux.com)** and **iTerm2** as terminal backends, with auto-detection.

## Prerequisites

- macOS with [cmux](https://cmux.com) (recommended) or [iTerm2](https://iterm2.com/)
- `screen` (`brew install screen` if missing)
- [Bun](https://bun.sh) (auto-installed on first plugin install if missing)

## Install

```
/plugin install agiterra/crew
```

## What It Does

Crew manages three independent layers:

- **Agents** — Claude Code instances running in persistent `screen` sessions. Survive pane closes and terminal crashes.
- **Panes** — Terminal pane viewports. Think of them as conference rooms — agents sit in them but don't own them.
- **Tabs** — Terminal tabs/workspaces containing layouts of panes.

Agents and panes are independent. An agent can run without a pane (headless), and a pane can exist without an agent (empty shell).

## Capabilities

### Launch and manage agents

```
"Launch an agent called 'reviewer' in ~/Projects/my-app with the prompt 'Review the PR for security issues'"
"Stop the reviewer agent"
"List all running agents"
"Read what the reviewer agent is doing"
"Send 'focus on the auth module' to the reviewer"
```

### Arrange agents in panes

```
"Create a new tab called 'engineering' with the trees theme"
"Create a pane in the engineering tab"
"Attach the reviewer agent to the oak pane"
"Detach the reviewer from its pane"
"Move the reviewer to the maple pane"
"Swap the reviewer and planner agents"
```

### Pane themes

Themes auto-name panes and set background images (iTerm2) or sidebar metadata (cmux). Built-in themes: `trees`, `cities`, `rivers`, `stones`, `peaks`, `spices`.

```
"Create a tab called 'team' with the cities theme"
"Build a new theme based on mountains"
```

Each pane gets a unique name from the theme pool (e.g., `oak`, `maple`, `cedar` for the trees theme) and a matching background image at 50% blend (iTerm2 only).

### Monitor and recover

```
"Run reconcile to check agent/pane state"
"Show crew status"
"Read the output from all agents"
```

## Standard Workflow

A typical session looks like:

1. **Create a tab** — `tab_create` makes a new terminal tab/workspace with an optional theme
2. **Create panes** — `pane_create` splits panes in the tab with themed names
3. **Launch agents** — `agent_launch` starts Claude Code in a screen session
4. **Attach** — `agent_attach` connects an agent's screen to a pane so you can see it
5. **Send work** — `agent_send` delivers prompts to running agents

## Spawning Wire-using agents

Crew is a pure env-forwarder. It has no domain knowledge of Wire, signing keys, or agent identity beyond the `id`/`name` it receives. When you spawn an agent that will connect to Wire, **you** (the orchestrator) are responsible for provisioning its identity. The convention:

1. **Generate an Ed25519 keypair in memory.** Never persist to disk; never rely on the spawned agent auto-creating keys. Filesystem key management was intentionally removed from shared `-tools` packages — that concern belongs to the orchestrator, not to shared libraries or to the spawned agent.

2. **Pre-register the public key on Wire** using the sponsoring-agent register flow: sign the register request with your own JWT, name the new agent, and include its public key. Wire trusts your sponsorship.

3. **Pass everything via `env`.** Identity (`AGENT_ID`, `AGENT_NAME`), the signing key (`AGENT_PRIVATE_KEY`), and any other config the spawned agent needs all flow through the `env` map. Crew exports them verbatim into the spawned process's environment. Crew has no separate `id` or `name` parameter — those names are env conventions interpreted by Wire-using agents, not API surface that crew defines.

```
agent_launch({
  env: {
    AGENT_ID: "waffles",
    AGENT_NAME: "Waffles",
    AGENT_PRIVATE_KEY: "<base64 PKCS8>",
    // any other env vars the spawned agent needs
  },
  project_dir: "/path/to/worktree",
  prompt: "Verify the staging deploy for ENG-1234",
})
```

`env.AGENT_ID` is the only var crew itself reads — it uses it as the screen session name (`wire-<id>`) and the DB record key. Everything else is opaque to crew.

**Do not** write `.env` files containing `AGENT_*` vars into the spawned agent's working directory. Ephemeral agents are frequently spawned out of shared project dirs (worktrees, monorepos) where a committed `.env` would either collide with sibling spawns or leak identity across them. Identity is provisioned at launch, not from the filesystem.

**Do not** ask crew to generate keys, store keys, or know about Wire. Crew accepts an arbitrary `env` map and forwards it. The specific var names and their semantics are the orchestrator's responsibility.

### Spawning a Codex CLI agent

Codex CLI agents follow the same env-map pattern, but the runtime needs additional plumbing because Codex's MCP integration differs from CC's. Set `runtime: "codex"` and the rest is handled by `~/.wire/codex-launch.sh` (auto-loaded via `~/.wire/runtimes.json` runtime override):

```
agent_launch({
  runtime: "codex",
  env: {
    AGENT_ID: "biscuit",
    AGENT_NAME: "Biscuit",
    AGENT_PRIVATE_KEY: "<base64 PKCS8>",
    GITHUB_TOKEN: "<for GitHub-over-Wire>",  // optional
    // WIRE_URL defaults to https://the-wire.ngrok.io
  },
  project_dir: "/path/to/worktree",
  prompt: "Your engineer prompt — see polling guidance below.",
})
```

**What the codex agent gets**:
- `wire` MCP — `get_pending_messages`, `set_plan`, `heartbeat_*` tools
- `wire-ipc` MCP — `send_message` for outbound IPC
- `operator-relay` MCP — operator-prompt forwarding
- `agiterra-github` MCP — GitHub-over-Wire (webhook registration)

**Polling cadence — must be in the spawn prompt.** Codex doesn't support push notifications the way CC does (`notifications/claude/channel` is Claude-specific). Inbound IPC is delivered via a polling tool. Tell the agent to call `mcp__wire__get_pending_messages` at the start of each turn AND every ~10–30s during long work. Without this, IPC arrives but the agent never sees it. Sample prompt fragment:

> Every turn, call `mcp__wire__get_pending_messages` first. If it returns any messages, treat them as inbound IPC from Brioche or other agents and respond to each before continuing your task.

**Outbound IPC**: `mcp__wire-ipc__send_message({topic, dest, payload})` — same shape as the CC adapter.

**Isolation**: each spawn gets a per-agent `CODEX_HOME` under `~/.wire/codex-spawn/<agent_id>/`. Tim's personal `~/.codex/config.toml` is untouched.

**Sandbox**: spawned codex runs with `--sandbox danger-full-access` because Wire SSE + signed-IPC HTTP need network and engineers need shell write. If you need stricter sandboxing for a specific spawn, edit the launcher.

**Known limitations**:
- `knowledge-codex` and `crew-codex` aren't wired (knowledge-codex has no MCP server entry point; crew-codex transitively depends on the bun runtime). Spawned codex engineers can't run vault searches via MCP, and can't spawn sub-agents. Both are deliberate scope cuts; revisit when needed.
- The launcher uses `tsx` rather than `bun` because codex's MCP client (rmcp) hangs when handshaking with bun-spawned stdio children. Same scripts work fine via direct `bun run` invocation; the incompatibility is at the codex spawn layer.

## Terminal Backend

Crew auto-detects which terminal you're running in:

| Terminal | Detection | Features |
|----------|-----------|----------|
| **cmux** | `CMUX_SURFACE_ID` env var | Split panes, embedded browser, sidebar metadata, notifications |
| **iTerm2** | Default fallback | Split panes, AppleScript control, dynamic profiles, background images |

Override with the `CREW_TERMINAL` env var:

```bash
export CREW_TERMINAL=cmux   # Force cmux backend
export CREW_TERMINAL=iterm  # Force iTerm2 backend
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `CREW_TERMINAL` | auto-detect | Terminal backend: `cmux` or `iterm` |
| `WIRE_URL` | `http://localhost:9800` | Wire server URL passed to spawned agents |

No env vars are required for basic local use. Crew itself has no identity on Wire — identity is a concern of the agents it spawns. See *Spawning Wire-using agents* above for how orchestrators provision identity at launch time.

### Notifications

Crew ships `Notification` and `Stop` hooks that forward Claude Code's "waiting for input" and "agent stopped" events to cmux, producing macOS notification banners. To silence them, disable the hooks in your Claude Code settings or uninstall cmux. Requires cmux on `PATH` (the hook is a no-op otherwise).

## Architecture

- Agents run in GNU `screen` sessions (persistent, survives terminal crashes)
- Terminal backend abstraction supports cmux and iTerm2
- cmux: uses CLI/socket API for pane operations
- iTerm2: uses AppleScript (`osascript`) and Dynamic Profiles for backgrounds
- State stored in SQLite (`~/.wire/crews.db`)
- Agent identity + crypto via `@agiterra/wire-tools`
