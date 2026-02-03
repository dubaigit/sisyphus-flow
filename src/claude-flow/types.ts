/**
 * Claude-Flow Runtime Types
 *
 * Type definitions for the claude-flow orchestration integration.
 * claude-flow is treated as an external runtime (daemon + MCP),
 * never as a library import.
 */

export type ClaudeFlowTransport = "mcp" | "cli"

export type RuntimeStatus = "stopped" | "starting" | "running" | "error" | "degraded"

/** Function type for spawning subprocesses (injectable for testing) */
export type SpawnFn = typeof import("bun").spawn

/** Function type for executing a command and returning output (injectable for testing) */
export type ExecFn = (args: string[], timeoutMs?: number) => Promise<{ exitCode: number; stdout: string; stderr: string }>

export interface ClaudeFlowConfig {
  /** Enable claude-flow integration (default: false) */
  enabled: boolean
  /** Runtime mode: 'managed' auto-starts daemon, 'external' expects running instance */
  runtime: "managed" | "external"
  /** MCP server port (default: 3000) */
  mcpPort: number
  /** Version pin (default: "v3alpha") */
  versionPin: string
  /** Transport preference order */
  transport: ClaudeFlowTransport
  /** Auto-start daemon on plugin load (default: true when runtime=managed) */
  autoStart: boolean
  /** Health check interval in ms (default: 30000) */
  healthCheckIntervalMs: number
  /** Command to invoke claude-flow (default: ["npx", "claude-flow@{versionPin}"]).
   *  Supports bunx, pnpm dlx, or absolute path. */
  command: string[]
  /** Routing policy: maps categories to executor backends */
  routingPolicy: RoutingPolicy
  /** Memory configuration */
  memory: ClaudeFlowMemoryConfig
  /** Consensus configuration */
  consensus: ClaudeFlowConsensusConfig
}

export interface RoutingPolicy {
  /** Enable swarm routing (default: false — all goes to LocalBackend) */
  enabled: boolean
  /** Categories that route to SwarmBackend */
  swarmCategories: string[]
  /** Categories that always stay local */
  localCategories: string[]
  /** Default executor when category not explicitly mapped */
  defaultExecutor: "local" | "swarm"
  /** Auto-invoke swarm threshold: min files changed to trigger swarm */
  autoSwarmFileThreshold: number
}

export interface ClaudeFlowMemoryConfig {
  /** Enable memory integration (default: false) */
  enabled: boolean
  /** Memory backend */
  backend: "hybrid" | "agentdb" | "sqlite" | "memory"
  /** Default namespace for memory operations */
  defaultNamespace: string
  /** Max results per search */
  maxSearchResults: number
  /** Auto-store learnings after task completion */
  autoStoreLearnings: boolean
}

export interface ClaudeFlowConsensusConfig {
  /** Enable consensus integration (default: false) */
  enabled: boolean
  /** Default consensus algorithm */
  defaultAlgorithm: "raft" | "byzantine" | "gossip" | "crdt" | "quorum"
  /** Categories that require consensus before execution */
  requiredCategories: string[]
}

export interface RuntimeHealth {
  status: RuntimeStatus
  version: string | null
  uptime: number | null
  lastHealthCheck: number
  error: string | null
  capabilities: RuntimeCapabilities
}

export interface RuntimeCapabilities {
  swarm: boolean
  memory: boolean
  hiveMind: boolean
  security: boolean
  neural: boolean
  plugins: boolean
  mcp: boolean
}

// --- Tool Result Types ---

export interface SwarmInitResult {
  success: boolean
  swarmId?: string
  topology: string
  maxAgents: number
  strategy: string
  error?: string
}

export interface SwarmStatusResult {
  running: boolean
  swarmId?: string
  topology?: string
  agentCount?: number
  agents?: Array<{ name: string; type: string; status: string }>
  error?: string
}

export interface MemoryStoreResult {
  success: boolean
  key: string
  namespace: string
  error?: string
}

export interface MemorySearchResult {
  success: boolean
  results: Array<{
    key: string
    value: string
    score: number
    namespace: string
    tags?: string[]
  }>
  error?: string
}

export interface ConsensusResult {
  success: boolean
  decision: string
  algorithm: string
  confidence: number
  votes?: Array<{ agent: string; vote: string; rationale: string }>
  error?: string
}

export interface SecurityScanResult {
  success: boolean
  findings: Array<{
    severity: "critical" | "high" | "medium" | "low" | "info"
    type: string
    description: string
    location?: string
    fix?: string
  }>
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  error?: string
}

export interface AgentSpawnResult {
  success: boolean
  agentId?: string
  name: string
  type: string
  error?: string
}

// --- Default Config ---

export const DEFAULT_CLAUDE_FLOW_CONFIG: ClaudeFlowConfig = {
  enabled: false,
  runtime: "managed",
  mcpPort: 3000,
  versionPin: "v3alpha",
  transport: "mcp",
  autoStart: true,
  healthCheckIntervalMs: 30000,
  command: ["npx", "claude-flow@v3alpha"],
  routingPolicy: {
    enabled: false,
    swarmCategories: ["ultrabrain"],
    localCategories: ["quick"],
    defaultExecutor: "local",
    autoSwarmFileThreshold: 3,
  },
  memory: {
    enabled: false,
    backend: "hybrid",
    defaultNamespace: "shared",
    maxSearchResults: 10,
    autoStoreLearnings: false,
  },
  consensus: {
    enabled: false,
    defaultAlgorithm: "raft",
    requiredCategories: [],
  },
}
