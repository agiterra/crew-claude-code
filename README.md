# crew

> Multi-agent orchestration. Launch AI engineers in persistent screen sessions, arrange them in themed terminal panes, and supervise them like a team.

Part of the [Agiterra Multi-Agent Toolkit](https://github.com/agiterra/handbook). Supports **[cmux](https://cmux.com)** and **iTerm2** with auto-detection. Runtime-neutral — spawn **Claude Code** or **Codex** agents.

## What this gets you

- **Spawn agents that survive lid-closes.** Each agent runs in a `screen` session — close your terminal, kill iTerm, reboot your laptop; the agent's still there waiting.
- **Multiple agents in one window.** Arrange them in panes, each with a themed background so you can tell them apart at a glance.
- **Talk to them individually.** `agent_send` types a prompt into a specific agent's screen.
- **A coordinator pattern that just works.** A permanent **personai** dispatches ephemeral engineers per ticket; you supervise the personai; everyone stays in their lane.

## Personai vs ephemerals

Crew is the spawn mechanism for the toolkit's two-tier identity model:

- A **personai** is a permanent agent — its own git repo, knowledge vault, and spawn scripts; it persists across days, machines, and reboots. On the Wire dashboard it stays visible even when offline (greyed), and the broker queues its messages for replay on next launch.
- An **ephemeral** is a short-lived worker a personai spawns with crew to parallelize one job, then soft-reaps when the work is done. Ephemerals are purged from the dashboard rather than kept around.

Crew itself doesn't enforce this distinction — it's a pure env-forwarder. The personai/ephemeral roles come from how you provision identity at launch (see *Spawning Wire-using agents*).

## Quick setup

If you have an agent open, say:

> "Install the Agiterra crew plugin and show me how to spawn my first ephemeral engineer."

Or manually:

```
/plugin marketplace add agiterra/claude-marketplace   # one-time
/plugin install crew@agiterra
```

### Prerequisites
- macOS with [cmux](https://cmux.com) (recommended) or [iTerm2](https://iterm2.com/)
- `screen` (`brew install screen` if missing)
- [Bun](https://bun.sh) (auto-installed on first plugin install if missing)

## What It Does

Crew manages three independent layers:

- **Agents** — agent-runtime instances (Claude Code, Codex, …) running in persistent `screen` sessions. Survive pane closes and terminal crashes.
- **Panes** — Terminal pane viewports. Think of them as conference rooms — agents sit in them but don't own them.
- **Tabs** — Terminal tabs/workspaces containing layouts of panes.

Agents and panes are independent. An agent can run without a pane (headless), and a pane can exist without an agent (empty shell).

Pick the runtime per launch with the `agent_launch` `runtime` parameter (`claude-code`, `codex`, …; default `claude-code`). Crew has no domain knowledge of the runtime beyond its launch-command template.

## Capabilities

### Launch and manage agents

```
"Launch an agent called 'reviewer' in ~/Projects/my-app with the prompt 'Review the PR for security issues'"
"Read what the reviewer agent is doing"
"Send 'focus on the auth module' to the reviewer"
"Interrupt the reviewer and re-prompt it"
"List all running agents"
"Close the reviewer agent"   # clean shutdown — preferred
"Stop the reviewer agent"    # hard kill — fallback only
```

Two ways to shut an agent down:

- **`agent_close`** (preferred) sends `/exit` so the runtime exits cleanly and fires its `SessionEnd` hooks — an ephemeral is de-registered from the Wire dashboard immediately rather than greyed for an hour.
- **`agent_stop`** is a hard kill, for exceptional cases only (runtime unresponsive/hung, or you specifically need to skip clean-shutdown hooks).

Other agent operations: `agent_interrupt` (send an interrupt + new prompt), `agent_resume` (resume a stopped/idle agent's prior CC session), and `agent_badge` (set the badge text shown in the pane top-right when attached).

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

### Multi-machine fleets

Crew keeps a registry of machines so a coordinator can see and manage agents across hosts:

- `machine_register` / `machine_list` / `machine_remove` — manage the host registry
- `machine_probe` — check reachability of a registered machine

(Spawning agents directly onto a remote machine from `agent_launch` is a newer crew-tools capability not yet pinned by this plugin version.)

## Standard Workflow

A typical session looks like:

1. **Create a tab** — `tab_create` makes a new terminal tab/workspace with an optional theme
2. **Create panes** — `pane_create` splits panes in the tab with themed names
3. **Launch agents** — `agent_launch` starts the runtime in a screen session
4. **Attach** — `agent_attach` connects an agent's screen to a pane so you can see it
5. **Send work** — `agent_send` delivers prompts to running agents
6. **Confirm** — for runtimes that prompt on first launch (e.g. Claude Code's dev-channel prompt), `agent_send '\r'` to confirm

## Spawning Wire-using agents

Crew is a pure env-forwarder. It has no domain knowledge of Wire, signing keys, or agent identity beyond the `id`/`name` it receives. When you spawn an agent that will connect to Wire, **you** (the orchestrator) are responsible for provisioning its identity. The convention:

1. **Generate an Ed25519 keypair in memory.** Never persist to disk; never rely on the spawned agent auto-creating keys. Filesystem key management was intentionally removed from shared `-tools` packages — that concern belongs to the orchestrator, not to shared libraries or to the spawned agent.

2. **Pre-register the new agent on Wire** by calling `mcp__plugin_wire_wire__register_agent({ id })` (from the `wire` plugin). In `fresh` mode this mints the keypair for you and returns `private_key_b64` — pass that to step 3 below. The request is signed under YOUR orchestrator AGENT_ID; Wire trusts you to vouch. If you're managing keys client-side, use the `byo` mode (supply `pubkey` yourself). Registering a *new permanent* agent requires operator auth — only a permanent agent (personai) or the operator may sponsor; see the handbook's registration model.

3. **Pass everything via `env`.** Identity (`AGENT_ID`, `AGENT_NAME`), the signing key (`AGENT_PRIVATE_KEY`), and any other config the spawned agent needs all flow through the `env` map. Crew exports them verbatim into the spawned process's environment. Crew has no separate `id` or `name` parameter — those names are env conventions interpreted by Wire-using agents, not API surface that crew defines.

```
agent_launch({
  env: {
    AGENT_ID: "waffles",
    AGENT_NAME: "Waffles",
    AGENT_PRIVATE_KEY: "<base64 PKCS8>",
    // any other env vars the spawned agent needs
  },
  runtime: "claude-code",        // or "codex"
  project_dir: "/path/to/worktree",
  prompt: "Verify the staging deploy for ENG-1234",
})
```

`env.AGENT_ID` is the only var crew itself reads — it uses it as the screen session name (`wire-<id>`) and the DB record key. Everything else is opaque to crew.

**Do not** write `.env` files containing `AGENT_*` vars into the spawned agent's working directory. Ephemeral agents are frequently spawned out of shared project dirs (worktrees, monorepos) where a committed `.env` would either collide with sibling spawns or leak identity across them. Identity is provisioned at launch, not from the filesystem.

**Do not** ask crew to generate keys, store keys, or know about Wire. Crew accepts an arbitrary `env` map and forwards it. The specific var names and their semantics are the orchestrator's responsibility. (The old `autosponsor` shortcut that bundled register+spawn was removed in crew-tools v2.10.0 — composite register-then-spawn workflows belong in a bundle plugin, not in crew.)

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

Crew ships `Notification` and `Stop` hooks that forward the runtime's "waiting for input" and "agent stopped" events to cmux, producing macOS notification banners. The hooks gate on `TERM_PROGRAM=cmux` and a `cmux` binary on `PATH` (no-op otherwise). To silence them, disable the hooks in your runtime's settings or uninstall cmux.

## Architecture

- Agents run in GNU `screen` sessions (persistent, survives terminal crashes)
- Terminal backend abstraction supports cmux and iTerm2
- cmux: uses CLI/socket API for pane operations
- iTerm2: uses AppleScript (`osascript`) and Dynamic Profiles for backgrounds
- State stored in SQLite (`~/.wire/crews.db`)
- Agent identity + crypto via `@agiterra/wire-tools`; orchestration via `@agiterra/crew-tools`
