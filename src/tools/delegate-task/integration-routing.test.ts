/// <reference types="bun-types" />
/**
 * Integration test: Routing → SwarmExecutor → ClaudeFlowRuntime
 *
 * Tests the full chain that tools.ts orchestrates:
 * 1. resolveExecutorBackend decides "swarm"
 * 2. executeSwarmTask calls runtime.swarmInit + runtime.agentSpawn
 * 3. On failure, fallbackToLocal triggers local executor path
 */
import { afterEach, describe, expect, it } from "bun:test"

import { resolveExecutorBackend } from "./routing"
import { executeSwarmTask, SWARM_CATEGORY_AGENT_MAP } from "./swarm-executor"
import {
  ClaudeFlowRuntime,
  createClaudeFlowRuntime,
  _resetRuntimeForTest,
  getClaudeFlowRuntime,
} from "../../claude-flow"
import type { ExecFn, RoutingPolicy } from "../../claude-flow/types"

/** Full mock of claude-flow CLI that tracks all calls */
function createTrackingExec(): { execFn: ExecFn; calls: string[] } {
  const calls: string[] = []
  const execFn: ExecFn = async (args) => {
    const joined = args.join(" ")
    calls.push(joined)

    if (args[0] === "--version") return { exitCode: 0, stdout: "3.1.0", stderr: "" }
    if (args[args.length - 1] === "--help") return { exitCode: 0, stdout: "ok", stderr: "" }
    if (joined.includes("swarm status")) return { exitCode: 0, stdout: JSON.stringify({ running: false }), stderr: "" }
    if (joined.includes("swarm init")) return { exitCode: 0, stdout: JSON.stringify({ swarmId: "integration-swarm-1" }), stderr: "" }
    if (joined.includes("agent spawn")) return { exitCode: 0, stdout: JSON.stringify({ agentId: "integration-agent-1" }), stderr: "" }
    if (joined.includes("swarm stop")) return { exitCode: 0, stdout: "stopped", stderr: "" }

    return { exitCode: 0, stdout: "", stderr: "" }
  }
  return { execFn, calls }
}

const ENABLED_POLICY: RoutingPolicy = {
  enabled: true,
  swarmCategories: ["ultrabrain", "refactoring"],
  localCategories: ["quick"],
  defaultExecutor: "local",
  autoSwarmFileThreshold: 3,
}

describe("Integration: routing → swarm-executor → runtime", () => {
  afterEach(async () => {
    const rt = getClaudeFlowRuntime()
    if (rt) await rt.stop()
    _resetRuntimeForTest()
  })

  it("full success path: routing=swarm → swarmInit → agentSpawn → result", async () => {
    //#given — running runtime with tracking exec
    const { execFn, calls } = createTrackingExec()
    const runtime = createClaudeFlowRuntime(
      { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
      { execFn },
    )
    await runtime.start()

    //#when — routing says swarm
    const routing = resolveExecutorBackend({
      category: "ultrabrain",
      policy: ENABLED_POLICY,
      runtimeAvailable: runtime.isRunning(),
    })
    expect(routing.executor).toBe("swarm")

    //#when — execute via swarm
    const result = await executeSwarmTask({
      description: "Deep architecture analysis",
      prompt: "Analyze the auth system architecture",
      category: "ultrabrain",
      agentToUse: "sisyphus-junior",
      systemContent: "You are a strategic architect",
      skills: ["git-master"],
    })

    //#then — swarm task succeeded
    expect(result.success).toBe(true)
    expect(result.executor).toBe("swarm")
    expect(result.fallbackToLocal).toBe(false)
    expect(result.agentType).toBe("architect") // ultrabrain → architect
    expect(result.output).toContain("SWARM TASK DISPATCHED")
    expect(result.output).toContain("ultrabrain")

    // Verify the runtime was called correctly
    const initCalls = calls.filter(c => c.includes("swarm init"))
    const spawnCalls = calls.filter(c => c.includes("agent spawn"))
    expect(initCalls.length).toBe(1)
    expect(spawnCalls.length).toBe(1)
    expect(spawnCalls[0]).toContain("-t architect")
  })

  it("routing=local skips swarm entirely", () => {
    //#given — quick category always goes local
    const routing = resolveExecutorBackend({
      category: "quick",
      policy: ENABLED_POLICY,
      runtimeAvailable: true,
    })

    //#then
    expect(routing.executor).toBe("local")
    expect(routing.reason).toContain("localCategories")
  })

  it("swarm failure triggers graceful fallback", async () => {
    //#given — runtime where agent spawn fails
    const failExec: ExecFn = async (args) => {
      const joined = args.join(" ")
      if (args[0] === "--version") return { exitCode: 0, stdout: "3.1.0", stderr: "" }
      if (args[args.length - 1] === "--help") return { exitCode: 0, stdout: "ok", stderr: "" }
      if (joined.includes("swarm status")) return { exitCode: 0, stdout: JSON.stringify({ running: true }), stderr: "" }
      if (joined.includes("agent spawn")) return { exitCode: 1, stdout: "", stderr: "resource exhausted" }
      return { exitCode: 0, stdout: "", stderr: "" }
    }

    const runtime = createClaudeFlowRuntime(
      { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
      { execFn: failExec },
    )
    await runtime.start()

    //#when — routing says swarm, but spawn fails
    const routing = resolveExecutorBackend({
      category: "ultrabrain",
      policy: ENABLED_POLICY,
      runtimeAvailable: true,
    })
    expect(routing.executor).toBe("swarm")

    const result = await executeSwarmTask({
      description: "Test task",
      prompt: "Do something",
      category: "ultrabrain",
      agentToUse: "sisyphus-junior",
    })

    //#then — fallback triggered
    expect(result.success).toBe(false)
    expect(result.fallbackToLocal).toBe(true)
    expect(result.reason).toContain("spawn")
  })

  it("runtime unavailable triggers immediate fallback", async () => {
    //#given — no runtime at all
    _resetRuntimeForTest()

    //#when
    const routing = resolveExecutorBackend({
      category: "ultrabrain",
      policy: ENABLED_POLICY,
      runtimeAvailable: false,
    })

    //#then — routing itself says local due to runtime unavailable
    expect(routing.executor).toBe("local")

    // Even if routing were bypassed, swarm executor also fails gracefully
    const result = await executeSwarmTask({
      description: "Test",
      prompt: "Test",
      category: "ultrabrain",
      agentToUse: "sisyphus-junior",
    })
    expect(result.fallbackToLocal).toBe(true)
  })

  it("disabled routing always returns local regardless of category", () => {
    //#given
    const disabledPolicy: RoutingPolicy = { ...ENABLED_POLICY, enabled: false }

    //#when
    const r1 = resolveExecutorBackend({ category: "ultrabrain", policy: disabledPolicy, runtimeAvailable: true })
    const r2 = resolveExecutorBackend({ category: "refactoring", policy: disabledPolicy, runtimeAvailable: true })

    //#then
    expect(r1.executor).toBe("local")
    expect(r2.executor).toBe("local")
  })

  it("maps all standard categories to valid agent types", () => {
    //#given
    const standardCategories = [
      "ultrabrain", "visual-engineering", "artistry", "quick",
      "unspecified-low", "unspecified-high", "writing",
      "visual", "business-logic", "testing", "documentation", "refactoring",
    ]

    //#then — every category has a mapping
    for (const cat of standardCategories) {
      const agentType = SWARM_CATEGORY_AGENT_MAP[cat]
      expect(agentType).toBeDefined()
      expect(["architect", "coder", "tester", "researcher"]).toContain(agentType)
    }
  })
})
