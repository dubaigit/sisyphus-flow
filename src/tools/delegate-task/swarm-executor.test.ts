/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  executeSwarmTask,
  type SwarmExecutorInput,
  type SwarmExecutorDeps,
  SWARM_CATEGORY_AGENT_MAP,
} from "./swarm-executor"
import { ClaudeFlowRuntime, _resetRuntimeForTest, createClaudeFlowRuntime } from "../../claude-flow"
import type { ExecFn } from "../../claude-flow/types"

/** Creates a mock execFn that fakes a healthy, swarm-capable runtime */
function createMockExec(overrides?: {
  swarmStatus?: { running: boolean; agentCount?: number }
  swarmInitResult?: { exitCode: number; stdout: string; stderr: string }
  agentSpawnResult?: { exitCode: number; stdout: string; stderr: string }
}): ExecFn {
  return async (args: string[]) => {
    const joined = args.join(" ")

    // Version check
    if (args.length === 1 && args[0] === "--version") {
      return { exitCode: 0, stdout: "3.1.0", stderr: "" }
    }

    // Help probes (capability check)
    if (args.length >= 2 && args[args.length - 1] === "--help") {
      return { exitCode: 0, stdout: "help text", stderr: "" }
    }

    // Swarm status
    if (joined.includes("swarm status")) {
      const status = overrides?.swarmStatus ?? { running: false }
      return { exitCode: 0, stdout: JSON.stringify(status), stderr: "" }
    }

    // Swarm init
    if (joined.includes("swarm init")) {
      return overrides?.swarmInitResult ?? { exitCode: 0, stdout: '{"swarmId":"test-swarm-1"}', stderr: "" }
    }

    // Agent spawn
    if (joined.includes("agent spawn")) {
      return overrides?.agentSpawnResult ?? { exitCode: 0, stdout: '{"agentId":"agent-1"}', stderr: "" }
    }

    // Swarm stop
    if (joined.includes("swarm stop")) {
      return { exitCode: 0, stdout: "stopped", stderr: "" }
    }

    return { exitCode: 0, stdout: "", stderr: "" }
  }
}

function makeInput(overrides?: Partial<SwarmExecutorInput>): SwarmExecutorInput {
  return {
    description: "Test swarm task",
    prompt: "Do something useful",
    category: "ultrabrain",
    agentToUse: "sisyphus-junior",
    systemContent: "You are a test agent",
    skills: ["git-master"],
    ...overrides,
  }
}

describe("executeSwarmTask", () => {
  afterEach(() => {
    _resetRuntimeForTest()
  })

  describe("when runtime is unavailable", () => {
    it("returns fallback result with executor=local", async () => {
      //#given — no runtime created
      _resetRuntimeForTest()

      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(false)
      expect(result.fallbackToLocal).toBe(true)
      expect(result.reason).toContain("unavailable")
    })
  })

  describe("when runtime is available but not running", () => {
    it("returns fallback result", async () => {
      //#given — runtime created but not started (disabled)
      createClaudeFlowRuntime(
        { enabled: false, healthCheckIntervalMs: 0 },
        { execFn: createMockExec() },
      )

      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(false)
      expect(result.fallbackToLocal).toBe(true)
      expect(result.reason).toContain("not running")
    })
  })

  describe("when runtime is running", () => {
    let runtime: ClaudeFlowRuntime

    beforeEach(async () => {
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: createMockExec() },
      )
      await runtime.start()
    })

    afterEach(async () => {
      await runtime.stop()
      _resetRuntimeForTest()
    })

    it("initializes swarm when not already running", async () => {
      //#given — swarm status returns not running (default mock)
      const calls: string[] = []
      const trackingExec: ExecFn = async (args) => {
        calls.push(args.join(" "))
        return createMockExec()(args)
      }
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: trackingExec },
      )
      await runtime.start()

      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(true)
      expect(result.fallbackToLocal).toBe(false)
      const initCalls = calls.filter(c => c.includes("swarm init"))
      expect(initCalls.length).toBeGreaterThanOrEqual(1)
    })

    it("spawns an agent with correct type for the category", async () => {
      //#given
      const calls: string[] = []
      const trackingExec: ExecFn = async (args) => {
        calls.push(args.join(" "))
        return createMockExec()(args)
      }
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: trackingExec },
      )
      await runtime.start()

      //#when
      await executeSwarmTask(makeInput({ category: "ultrabrain" }))

      //#then
      const spawnCalls = calls.filter(c => c.includes("agent spawn"))
      expect(spawnCalls.length).toBeGreaterThanOrEqual(1)
      // ultrabrain maps to "architect" in SWARM_CATEGORY_AGENT_MAP
      expect(spawnCalls.some(c => c.includes("-t architect"))).toBe(true)
    })

    it("returns success with swarm metadata", async () => {
      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(true)
      expect(result.executor).toBe("swarm")
      expect(result.agentType).toBeDefined()
    })

    it("skips swarm init when swarm is already running", async () => {
      //#given — swarm status returns running
      const calls: string[] = []
      const trackingExec: ExecFn = async (args) => {
        calls.push(args.join(" "))
        return createMockExec({ swarmStatus: { running: true, agentCount: 3 } })(args)
      }
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: trackingExec },
      )
      await runtime.start()

      //#when
      await executeSwarmTask(makeInput())

      //#then
      const initCalls = calls.filter(c => c.includes("swarm init"))
      expect(initCalls.length).toBe(0)
    })

    it("handles swarm init failure gracefully with fallback", async () => {
      //#given
      const failingExec: ExecFn = async (args) => {
        const joined = args.join(" ")
        if (joined.includes("swarm init")) {
          return { exitCode: 1, stdout: "", stderr: "swarm init failed" }
        }
        return createMockExec()(args)
      }
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: failingExec },
      )
      await runtime.start()

      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(false)
      expect(result.fallbackToLocal).toBe(true)
      expect(result.reason).toContain("swarm init failed")
    })

    it("handles agent spawn failure gracefully with fallback", async () => {
      //#given — swarm already running but agent spawn fails
      const failingExec: ExecFn = async (args) => {
        const joined = args.join(" ")
        if (joined.includes("agent spawn")) {
          return { exitCode: 1, stdout: "", stderr: "spawn error: resource exhausted" }
        }
        return createMockExec({ swarmStatus: { running: true } })(args)
      }
      _resetRuntimeForTest()
      runtime = createClaudeFlowRuntime(
        { enabled: true, healthCheckIntervalMs: 0, runtime: "external" },
        { execFn: failingExec },
      )
      await runtime.start()

      //#when
      const result = await executeSwarmTask(makeInput())

      //#then
      expect(result.success).toBe(false)
      expect(result.fallbackToLocal).toBe(true)
      expect(result.reason).toContain("spawn")
    })
  })

  describe("SWARM_CATEGORY_AGENT_MAP", () => {
    it("maps ultrabrain to architect", () => {
      expect(SWARM_CATEGORY_AGENT_MAP.ultrabrain).toBe("architect")
    })

    it("has a default fallback for unmapped categories", () => {
      //#given — category not in map
      const category = "some-unknown-category"

      //#when
      const agentType = SWARM_CATEGORY_AGENT_MAP[category] ?? "coder"

      //#then — falls back to coder
      expect(agentType).toBe("coder")
    })
  })
})
