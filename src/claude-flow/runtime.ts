/**
 * ClaudeFlowRuntime — Managed lifecycle adapter for claude-flow daemon.
 *
 * Architecture:
 *   sisyphus-flow (plugin) → ClaudeFlowRuntime → claude-flow (daemon/MCP)
 *
 * The runtime:
 * 1. Auto-starts claude-flow daemon as a managed subprocess
 * 2. Communicates via MCP (primary) or CLI (fallback)
 * 3. Probes capabilities on startup
 * 4. Provides health monitoring
 * 5. Gracefully shuts down on plugin exit
 *
 * Design principle: claude-flow is an external runtime, never a library import.
 *
 * Testability: spawnFn and execFn are injectable for unit tests.
 */

import { spawn, type Subprocess } from "bun"
import { log } from "../shared/logger"
import type {
  ClaudeFlowConfig,
  RuntimeHealth,
  RuntimeStatus,
  RuntimeCapabilities,
  SwarmInitResult,
  SwarmStatusResult,
  MemoryStoreResult,
  MemorySearchResult,
  ConsensusResult,
  SecurityScanResult,
  AgentSpawnResult,
  SpawnFn,
  ExecFn,
} from "./types"
import { DEFAULT_CLAUDE_FLOW_CONFIG } from "./types"

const RUNTIME_TAG = "[claude-flow-runtime]"

/** Stable error prefix for all cf_* tools when runtime is unavailable */
export const CF_UNAVAILABLE_PREFIX = "[CF_UNAVAILABLE]"
/** Stable error for when claude-flow binary is not installed */
export const CF_NOT_INSTALLED = "[CF_NOT_INSTALLED]"

/** Options for injecting test doubles into ClaudeFlowRuntime */
export interface RuntimeDeps {
  /** Override subprocess spawn (default: Bun.spawn) */
  spawnFn?: SpawnFn
  /** Override CLI exec — if provided, replaces the internal exec implementation entirely */
  execFn?: ExecFn
}

export class ClaudeFlowRuntime {
  private config: ClaudeFlowConfig
  private daemon: Subprocess | null = null
  private health: RuntimeHealth
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private shutdownRequested = false
  private _spawnFn: SpawnFn
  private _execFn: ExecFn | null

  constructor(config?: Partial<ClaudeFlowConfig>, deps?: RuntimeDeps) {
    this.config = { ...DEFAULT_CLAUDE_FLOW_CONFIG, ...config }
    // Resolve command template: replace version pin placeholder
    if (!config?.command) {
      this.config.command = ["npx", `claude-flow@${this.config.versionPin}`]
    }
    this._spawnFn = deps?.spawnFn ?? spawn
    this._execFn = deps?.execFn ?? null
    this.health = {
      status: "stopped",
      version: null,
      uptime: null,
      lastHealthCheck: 0,
      error: null,
      capabilities: {
        swarm: false,
        memory: false,
        hiveMind: false,
        security: false,
        neural: false,
        plugins: false,
        mcp: false,
      },
    }
  }

  // --- Lifecycle ---

  async start(): Promise<boolean> {
    if (!this.config.enabled) {
      log(`${RUNTIME_TAG} disabled by config`)
      return false
    }

    if (this.health.status === "running") {
      log(`${RUNTIME_TAG} already running`)
      return true
    }

    this.health.status = "starting"
    log(`${RUNTIME_TAG} starting (runtime=${this.config.runtime}, transport=${this.config.transport})`)

    try {
      // Check if claude-flow is installed
      const version = await this.getVersion()
      if (!version) {
        this.health.status = "error"
        this.health.error = `${CF_NOT_INSTALLED} claude-flow not found. Install: npm install -g claude-flow@${this.config.versionPin}`
        log(`${RUNTIME_TAG} ERROR: ${this.health.error}`)
        return false
      }
      this.health.version = version
      log(`${RUNTIME_TAG} found version: ${version}`)

      // Start daemon if managed mode
      if (this.config.runtime === "managed" && this.config.autoStart) {
        await this.startDaemon()
      }

      // Probe capabilities
      await this.probeCapabilities()

      this.health.status = "running"
      this.health.uptime = Date.now()
      this.health.error = null

      // Start health monitoring
      this.startHealthCheck()

      log(`${RUNTIME_TAG} started successfully`, {
        version: this.health.version,
        capabilities: this.health.capabilities,
      })
      return true
    } catch (err) {
      this.health.status = "error"
      this.health.error = err instanceof Error ? err.message : String(err)
      log(`${RUNTIME_TAG} failed to start: ${this.health.error}`)
      return false
    }
  }

  async stop(): Promise<void> {
    this.shutdownRequested = true
    log(`${RUNTIME_TAG} stopping`)

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }

    if (this.daemon) {
      try {
        this.daemon.kill()
      } catch {
        // Best-effort SIGTERM
      }
      // Escalate to SIGKILL after 5s
      const killTimeout = setTimeout(() => {
        if (this.daemon) {
          try { this.daemon.kill(9) } catch { /* ignore */ }
        }
      }, 5000)
      try {
        await Promise.race([
          this.daemon.exited,
          new Promise(resolve => setTimeout(resolve, 6000)),
        ])
      } catch { /* ignore */ }
      clearTimeout(killTimeout)
      this.daemon = null
    }

    this.health.status = "stopped"
    this.health.uptime = null
    log(`${RUNTIME_TAG} stopped`)
  }

  getHealth(): RuntimeHealth {
    return { ...this.health }
  }

  isRunning(): boolean {
    return this.health.status === "running" || this.health.status === "degraded"
  }

  getConfig(): ClaudeFlowConfig {
    return { ...this.config }
  }

  // --- Swarm Operations ---

  async swarmInit(opts: {
    topology?: string
    maxAgents?: number
    strategy?: string
    consensus?: string
  }): Promise<SwarmInitResult> {
    const args = [
      "swarm", "init",
      "--topology", opts.topology ?? "hierarchical",
      "--max-agents", String(opts.maxAgents ?? 8),
      "--strategy", opts.strategy ?? "specialized",
    ]
    if (opts.consensus) args.push("--consensus", opts.consensus)

    const result = await this.exec(args)
    if (result.exitCode !== 0) {
      return { success: false, topology: opts.topology ?? "hierarchical", maxAgents: opts.maxAgents ?? 8, strategy: opts.strategy ?? "specialized", error: result.stderr }
    }
    return {
      success: true,
      topology: opts.topology ?? "hierarchical",
      maxAgents: opts.maxAgents ?? 8,
      strategy: opts.strategy ?? "specialized",
    }
  }

  async swarmStatus(): Promise<SwarmStatusResult> {
    const result = await this.exec(["swarm", "status", "--format", "json"])
    if (result.exitCode !== 0) {
      return { running: false, error: result.stderr }
    }
    try {
      const data = JSON.parse(result.stdout)
      return { running: true, ...data }
    } catch {
      return { running: result.stdout.includes("running"), error: undefined }
    }
  }

  async swarmStop(): Promise<boolean> {
    const result = await this.exec(["swarm", "stop"])
    return result.exitCode === 0
  }

  // --- Agent Operations ---

  async agentSpawn(opts: {
    type: string
    name?: string
    model?: string
    task?: string
    timeout?: number
  }): Promise<AgentSpawnResult> {
    const args = ["agent", "spawn", "--type", opts.type]
    if (opts.name) args.push("--name", opts.name)
    if (opts.model) args.push("--model", opts.model)
    if (opts.task) args.push("--task", opts.task)
    if (opts.timeout) args.push("--timeout", String(opts.timeout))

    const result = await this.exec(args)
    if (result.exitCode !== 0) {
      return { success: false, name: opts.name ?? opts.type, type: opts.type, error: result.stderr }
    }
    return { success: true, name: opts.name ?? opts.type, type: opts.type }
  }

  // --- Memory Operations ---

  async memoryStore(opts: {
    key: string
    value: string
    namespace?: string
    tags?: string[]
  }): Promise<MemoryStoreResult> {
    const ns = opts.namespace ?? this.config.memory.defaultNamespace
    const args = ["memory", "store", "-k", opts.key, "-v", opts.value, "--namespace", ns]
    if (opts.tags?.length) args.push("--tags", opts.tags.join(","))

    const result = await this.exec(args)
    if (result.exitCode !== 0) {
      return { success: false, key: opts.key, namespace: ns, error: result.stderr }
    }
    return { success: true, key: opts.key, namespace: ns }
  }

  async memorySearch(opts: {
    query: string
    namespace?: string
    limit?: number
    tags?: string[]
  }): Promise<MemorySearchResult> {
    const ns = opts.namespace ?? this.config.memory.defaultNamespace
    const args = ["memory", "search", "--query", opts.query, "--namespace", ns]
    if (opts.limit) args.push("--limit", String(opts.limit))
    if (opts.tags?.length) args.push("--tags", opts.tags.join(","))

    const result = await this.exec(args)
    if (result.exitCode !== 0) {
      return { success: false, results: [], error: result.stderr }
    }
    try {
      const data = JSON.parse(result.stdout)
      return { success: true, results: Array.isArray(data) ? data : data.results ?? [] }
    } catch {
      return { success: true, results: [{ key: "raw", value: result.stdout, score: 1, namespace: ns }] }
    }
  }

  async memoryRetrieve(opts: {
    key: string
    namespace?: string
  }): Promise<{ success: boolean; value?: string; error?: string }> {
    const ns = opts.namespace ?? this.config.memory.defaultNamespace
    const result = await this.exec(["memory", "retrieve", "-k", opts.key, "--namespace", ns])
    if (result.exitCode !== 0) {
      return { success: false, error: result.stderr }
    }
    return { success: true, value: result.stdout.trim() }
  }

  // --- Hive-Mind Operations ---

  async hiveMindConsensus(opts: {
    question: string
    algorithm?: string
    topology?: string
  }): Promise<ConsensusResult> {
    const algo = opts.algorithm ?? this.config.consensus.defaultAlgorithm

    // Spawn hive-mind first if not already running
    await this.exec(["hive-mind", "spawn", "--topology", opts.topology ?? "hierarchical", "--consensus", algo])

    const result = await this.exec(["hive-mind", "consensus", "--question", opts.question])
    if (result.exitCode !== 0) {
      return { success: false, decision: "", algorithm: algo, confidence: 0, error: result.stderr }
    }
    try {
      const data = JSON.parse(result.stdout)
      return { success: true, decision: data.decision ?? result.stdout, algorithm: algo, confidence: data.confidence ?? 0.8, votes: data.votes }
    } catch {
      return { success: true, decision: result.stdout.trim(), algorithm: algo, confidence: 0.7 }
    }
  }

  // --- Security Operations ---

  async securityScan(opts: {
    target?: string
    depth?: "quick" | "standard" | "deep" | "full"
    type?: "code" | "deps" | "container" | "all"
    fix?: boolean
  }): Promise<SecurityScanResult> {
    const args = [
      "security", "scan",
      "-t", opts.target ?? ".",
      "--depth", opts.depth ?? "standard",
      "--type", opts.type ?? "all",
      "--output", "json",
    ]
    if (opts.fix) args.push("--fix")

    const result = await this.exec(args)
    if (result.exitCode !== 0 && !result.stdout) {
      return {
        success: false,
        findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        error: result.stderr,
      }
    }
    try {
      const data = JSON.parse(result.stdout)
      return { success: true, findings: data.findings ?? [], summary: data.summary ?? { total: 0, critical: 0, high: 0, medium: 0, low: 0 } }
    } catch {
      return {
        success: true,
        findings: [],
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        error: "Could not parse scan output",
      }
    }
  }

  // --- Doctor/Diagnostics ---

  async doctor(fix = false): Promise<{ success: boolean; output: string }> {
    const args = ["doctor"]
    if (fix) args.push("--fix")
    const result = await this.exec(args)
    return { success: result.exitCode === 0, output: result.stdout || result.stderr }
  }

  // --- Internal ---

  private async getVersion(): Promise<string | null> {
    try {
      const result = await this.exec(["--version"], 10000)
      if (result.exitCode === 0 && result.stdout.trim()) {
        return result.stdout.trim()
      }
      return null
    } catch {
      return null
    }
  }

  private async startDaemon(): Promise<void> {
    log(`${RUNTIME_TAG} starting managed daemon`)
    try {
      this.daemon = this._spawnFn({
        cmd: [...this.config.command, "daemon", "start", "--port", String(this.config.mcpPort)],
        stdout: "pipe",
        stderr: "pipe",
      })
      // Give daemon time to start
      await new Promise(resolve => setTimeout(resolve, 2000))
      log(`${RUNTIME_TAG} daemon started (pid=${this.daemon.pid})`)
    } catch (err) {
      log(`${RUNTIME_TAG} daemon start failed: ${err}`)
      // Non-fatal: CLI transport still works
    }
  }

  private async probeCapabilities(): Promise<void> {
    log(`${RUNTIME_TAG} probing capabilities`)
    const caps: RuntimeCapabilities = {
      swarm: false,
      memory: false,
      hiveMind: false,
      security: false,
      neural: false,
      plugins: false,
      mcp: false,
    }

    // Probe each capability by checking if the command exists
    const probes: Array<[keyof RuntimeCapabilities, string[]]> = [
      ["swarm", ["swarm", "--help"]],
      ["memory", ["memory", "--help"]],
      ["hiveMind", ["hive-mind", "--help"]],
      ["security", ["security", "--help"]],
      ["neural", ["neural", "--help"]],
      ["plugins", ["plugins", "--help"]],
      ["mcp", ["mcp", "--help"]],
    ]

    const results = await Promise.allSettled(
      probes.map(async ([key, args]) => {
        const result = await this.exec(args, 5000)
        return { key, available: result.exitCode === 0 }
      })
    )

    for (const result of results) {
      if (result.status === "fulfilled") {
        caps[result.value.key] = result.value.available
      }
    }

    this.health.capabilities = caps
    log(`${RUNTIME_TAG} capabilities:`, caps)
  }

  private startHealthCheck(): void {
    if (this.config.healthCheckIntervalMs <= 0) return

    this.healthCheckTimer = setInterval(async () => {
      if (this.shutdownRequested) return

      try {
        const version = await this.getVersion()
        this.health.lastHealthCheck = Date.now()

        if (version) {
          if (this.health.status === "error" || this.health.status === "degraded") {
            this.health.status = "running"
            this.health.error = null
            log(`${RUNTIME_TAG} recovered`)
          }
        } else {
          if (this.health.status === "running") {
            this.health.status = "degraded"
            this.health.error = "Health check failed — CLI transport may still work"
            log(`${RUNTIME_TAG} degraded: version check failed`)
          }
        }
      } catch {
        // Silently handle health check failures
      }
    }, this.config.healthCheckIntervalMs)
  }

  private async exec(args: string[], timeoutMs = 30000): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Use injected exec if provided (for testing)
    if (this._execFn) {
      return this._execFn(args, timeoutMs)
    }

    const cmd = [...this.config.command, ...args]

    try {
      const proc = this._spawnFn({
        cmd,
        stdout: "pipe",
        stderr: "pipe",
      })

      const timeout = setTimeout(() => {
        try { proc.kill() } catch { /* ignore */ }
      }, timeoutMs)

      const exitCode = await proc.exited
      clearTimeout(timeout)

      const stdout = proc.stdout ? await new Response(proc.stdout).text() : ""
      const stderr = proc.stderr ? await new Response(proc.stderr).text() : ""

      return { exitCode, stdout, stderr }
    } catch (err) {
      return { exitCode: 1, stdout: "", stderr: err instanceof Error ? err.message : String(err) }
    }
  }
}

// Singleton instance
let runtimeInstance: ClaudeFlowRuntime | null = null

export function getClaudeFlowRuntime(): ClaudeFlowRuntime | null {
  return runtimeInstance
}

export function createClaudeFlowRuntime(config?: Partial<ClaudeFlowConfig>, deps?: RuntimeDeps): ClaudeFlowRuntime {
  if (runtimeInstance) {
    return runtimeInstance
  }
  runtimeInstance = new ClaudeFlowRuntime(config, deps)
  return runtimeInstance
}

export function destroyClaudeFlowRuntime(): void {
  if (runtimeInstance) {
    runtimeInstance.stop().catch(() => {})
    runtimeInstance = null
  }
}

/**
 * Reset singleton for testing. ONLY use in test teardown.
 * Does NOT call stop() — assumes caller handles cleanup.
 */
export function _resetRuntimeForTest(): void {
  runtimeInstance = null
}
