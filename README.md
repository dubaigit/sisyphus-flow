<div align="center">

[![sisyphus-flow](./.github/assets/hero.jpg)](https://github.com/dubaigit/sisyphus-flow)

# sisyphus-flow

**oh-my-opencode + claude-flow swarm orchestration**

Fork of [oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode) with native [claude-flow](https://github.com/ruvnet/claude-flow) multi-agent swarm integration as a first-class runtime.

[![GitHub](https://img.shields.io/badge/GitHub-dubaigit/sisyphus--flow-181717?logo=github)](https://github.com/dubaigit/sisyphus-flow)

</div>

---

## What is sisyphus-flow?

sisyphus-flow is an [OpenCode](https://github.com/sst/opencode) plugin that combines the agent orchestration capabilities of oh-my-opencode with claude-flow's multi-agent swarm coordination. It gives your AI coding sessions access to:

- **9 claude-flow tools** for swarm management, vector memory, HiveMind consensus, and security scanning
- **Smart routing** that automatically dispatches complex tasks to a swarm of coordinated agents
- **Memory-enhanced execution** that learns from past tasks and injects relevant patterns
- **Consensus gating** for high-stakes categories requiring swarm agreement before execution
- **Graceful fallback** — if claude-flow is unavailable, everything works locally without interruption

## Key Features

| Feature | Description |
|---------|-------------|
| **Swarm Orchestration** | 9 first-class claude-flow tools (`cf_swarm_init`, `cf_agent_spawn`, etc.) |
| **Smart Routing** | Categories route to swarm or local executor based on config |
| **Memory-Enhanced Tasks** | Pre-execution pattern search + post-execution learning storage |
| **HiveMind Consensus** | Swarm votes on approach before complex task execution |
| **11 Specialized Agents** | sisyphus-flow, oracle, librarian, explore, atlas, prometheus, and more |
| **34+ Lifecycle Hooks** | Todo enforcement, compaction, keyword detection, context injection |
| **LSP + AST Tools** | Go-to-definition, find references, rename, AST-grep search/replace |
| **Multi-Model Support** | Claude Opus 4.5, GPT-5.2, Gemini 3 Flash, GLM-4.7 |
| **Background Agents** | Parallel async task execution with concurrency controls |

## Quick Start

### 1. Install

```bash
# As an OpenCode plugin
npm install sisyphus-flow
```

### 2. Add to OpenCode config

Add to `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["sisyphus-flow"]
}
```

### 3. Configure

Create `~/.config/opencode/sisyphus-flow.json`:

```json
{
  "claude_flow": {
    "enabled": true,
    "runtime": "managed",
    "command": ["npx", "claude-flow@v3alpha"],
    "routingPolicy": {
      "enabled": true,
      "swarmCategories": ["ultrabrain"],
      "localCategories": ["quick"],
      "defaultExecutor": "local"
    },
    "memory": {
      "enabled": true,
      "autoStoreLearnings": true
    },
    "consensus": {
      "enabled": true,
      "defaultAlgorithm": "raft",
      "requiredCategories": ["ultrabrain"]
    }
  }
}
```

## Claude-Flow Tools

Nine first-class tools are registered when `claude_flow.enabled` is `true`:

| Tool | Description |
|------|-------------|
| `cf_swarm_init` | Initialize a swarm with topology, strategy, and max agents |
| `cf_swarm_status` | Get current swarm state, agent count, and topology |
| `cf_swarm_stop` | Stop the active swarm |
| `cf_agent_spawn` | Spawn a specialized agent (60+ types: coder, architect, tester, etc.) |
| `cf_memory_store` | Store knowledge in vector memory with namespace and tags |
| `cf_memory_search` | Semantic search across stored knowledge |
| `cf_memory_retrieve` | Retrieve a specific memory entry by key |
| `cf_hive_mind_consensus` | Run a consensus vote across swarm agents |
| `cf_security_scan` | Run security scan (CVEs, secrets, injection, XSS) |

All tools return `[CF_UNAVAILABLE]` prefix when the runtime is down, enabling graceful error handling.

## Routing System

The routing system decides whether a `delegate_task` call runs locally or via the claude-flow swarm:

```
delegate_task(category="ultrabrain", ...)
    ↓
[Memory Search] → inject relevant past patterns
    ↓
[Consensus Gate] → HiveMind votes on approach (for required categories)
    ↓
[Routing Decision] → swarm or local?
    ↓
[Swarm Executor] → claude-flow agent spawn
    ↓ (on failure)
[Local Fallback] → standard OpenCode session
    ↓
[Learning Store] → save task outcome to memory
```

### Routing Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `swarmCategories` | `["ultrabrain"]` | Categories routed to swarm |
| `localCategories` | `["quick"]` | Categories that always stay local |
| `defaultExecutor` | `"local"` | Fallback for unmapped categories |

Safety: `localCategories` takes precedence if a category appears in both lists.

## Architecture

```
┌─────────────────────────────────────────┐
│              OpenCode Host              │
│                                         │
│  ┌──────────────┐  ┌────────────────┐   │
│  │ sisyphus-flow│  │  claude-flow   │   │
│  │   (plugin)   │──│   (daemon)     │   │
│  │              │  │                │   │
│  │ • 11 agents  │  │ • Swarm coord  │   │
│  │ • 34+ hooks  │  │ • Memory/HNSW  │   │
│  │ • 9 CF tools │  │ • HiveMind     │   │
│  │ • Routing    │  │ • Security     │   │
│  │ • Memory L5  │  │ • 60+ agents   │   │
│  │ • Consensus  │  │ • Neural       │   │
│  └──────────────┘  └────────────────┘   │
│         ↕                               │
│  ClaudeFlowRuntime (adapter)            │
│  • Managed daemon lifecycle             │
│  • Health monitoring                    │
│  • CLI transport                        │
│  • Graceful fallback to local           │
└─────────────────────────────────────────┘
```

Key design decisions:
- claude-flow is a **managed daemon**, never a library import
- All calls go through `ClaudeFlowRuntime` adapter
- Tools are **conditionally registered** (only when enabled)
- **LocalBackend always works** — claude-flow being down breaks nothing

## Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| sisyphus-flow | Claude Opus 4.5 | Primary orchestrator |
| oracle | GPT-5.2 | Strategic architect, debugger |
| librarian | GLM-4.7 | Documentation, GitHub search |
| explore | Grok Code Fast | Fast codebase exploration |
| atlas | Claude Sonnet 4.5 | Master orchestrator hook |
| prometheus | Claude Opus 4.5 | Strategic planning |
| metis | Claude Opus 4.5 | Pre-planning consultant |
| momus | Claude Opus 4.5 | Plan reviewer |
| hephaestus | GPT-5.2 Codex | Autonomous deep worker |
| multimodal-looker | Gemini 3 Flash | PDF/image analysis |
| frontend-ui-ux | Gemini 3 Pro | UI/UX specialist |

## Development

```bash
# Install dependencies
bun install

# Type check
bun run typecheck

# Run tests (2100+ tests)
bun test

# Build
bun run build

# Build schema
bun run build:schema
```

## Configuration Reference

The `claude_flow` block in `sisyphus-flow.json` supports:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable claude-flow integration |
| `runtime` | string | `"managed"` | `"managed"` (auto-start) or `"external"` |
| `command` | string[] | `["npx", "claude-flow@v3alpha"]` | Binary to invoke |
| `routingPolicy.enabled` | boolean | `false` | Enable swarm routing |
| `routingPolicy.swarmCategories` | string[] | `["ultrabrain"]` | Swarm-routed categories |
| `routingPolicy.localCategories` | string[] | `["quick"]` | Always-local categories |
| `memory.enabled` | boolean | `false` | Enable memory search/store |
| `memory.autoStoreLearnings` | boolean | `false` | Auto-store after task completion |
| `consensus.enabled` | boolean | `false` | Enable HiveMind consensus gate |
| `consensus.requiredCategories` | string[] | `[]` | Categories requiring consensus |

Backward compatibility: also reads `oh-my-opencode.json` as fallback.

## Credits

- **[oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)** by [@code-yeongyu](https://github.com/code-yeongyu) — the foundation this fork builds on
- **[claude-flow](https://github.com/ruvnet/claude-flow)** by [@ruvnet](https://github.com/ruvnet) — multi-agent swarm orchestration runtime
- **[OpenCode](https://github.com/sst/opencode)** — the AI coding platform sisyphus-flow extends

## License

MIT
