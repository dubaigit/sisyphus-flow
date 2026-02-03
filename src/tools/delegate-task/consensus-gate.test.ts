import { describe, test, expect } from "bun:test"
import { runConsensusGate, augmentPromptWithConsensus, type ConsensusGateResult } from "./consensus-gate"
import type { ClaudeFlowConsensusConfig } from "../../claude-flow/types"
import type { ClaudeFlowRuntime } from "../../claude-flow/runtime"

const baseConfig: ClaudeFlowConsensusConfig = {
  enabled: true,
  defaultAlgorithm: "raft",
  requiredCategories: ["ultrabrain"],
}

function makeMockRuntime(overrides: Partial<{
  isRunning: boolean
  consensusResult: { success: boolean; decision: string; confidence: number; error?: string }
}> = {}): ClaudeFlowRuntime {
  return {
    isRunning: () => overrides.isRunning ?? true,
    hiveMindConsensus: async () => overrides.consensusResult ?? {
      success: true,
      decision: "Use event sourcing pattern",
      algorithm: "raft",
      confidence: 0.85,
    },
  } as unknown as ClaudeFlowRuntime
}

describe("consensus-gate", () => {
  //#given consensus is disabled
  test("returns early when consensus is disabled", async () => {
    const result = await runConsensusGate({
      category: "ultrabrain",
      description: "test",
      prompt: "test prompt",
      consensusConfig: { ...baseConfig, enabled: false },
    })

    //#then should skip consensus
    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toBe("consensus disabled")
  })

  //#given category not in requiredCategories
  test("skips consensus for non-required categories", async () => {
    const result = await runConsensusGate({
      category: "quick",
      description: "test",
      prompt: "test prompt",
      consensusConfig: baseConfig,
    })

    //#then should skip
    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toContain("not in requiredCategories")
  })

  //#given runtime is unavailable
  test("skips consensus when runtime is unavailable", async () => {
    const result = await runConsensusGate(
      { category: "ultrabrain", description: "test", prompt: "test", consensusConfig: baseConfig },
      { getRuntimeFn: () => null },
    )

    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toBe("runtime unavailable")
  })

  //#given runtime not running
  test("skips consensus when runtime is not running", async () => {
    const runtime = makeMockRuntime({ isRunning: false })
    const result = await runConsensusGate(
      { category: "ultrabrain", description: "test", prompt: "test", consensusConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toBe("runtime unavailable")
  })

  //#given consensus succeeds
  test("obtains consensus for required category", async () => {
    const runtime = makeMockRuntime()
    const result = await runConsensusGate(
      { category: "ultrabrain", description: "Design auth system", prompt: "Build JWT auth", consensusConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    //#then should obtain consensus
    expect(result.consensusObtained).toBe(true)
    expect(result.decision).toBe("Use event sourcing pattern")
    expect(result.confidence).toBe(0.85)
  })

  //#given consensus fails
  test("returns gracefully when consensus fails", async () => {
    const runtime = makeMockRuntime({
      consensusResult: { success: false, decision: "", confidence: 0, error: "timeout" },
    })
    const result = await runConsensusGate(
      { category: "ultrabrain", description: "test", prompt: "test", consensusConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toContain("consensus failed")
  })

  //#given consensus throws
  test("handles runtime exception gracefully", async () => {
    const runtime = {
      isRunning: () => true,
      hiveMindConsensus: async () => { throw new Error("network timeout") },
    } as unknown as ClaudeFlowRuntime

    const result = await runConsensusGate(
      { category: "ultrabrain", description: "test", prompt: "test", consensusConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.consensusObtained).toBe(false)
    expect(result.reason).toContain("network timeout")
  })
})

describe("augmentPromptWithConsensus", () => {
  test("returns original prompt when no consensus", () => {
    const gate: ConsensusGateResult = { consensusObtained: false, decision: "", confidence: 0, reason: "disabled" }
    expect(augmentPromptWithConsensus("original", gate)).toBe("original")
  })

  test("augments prompt with consensus decision", () => {
    const gate: ConsensusGateResult = {
      consensusObtained: true,
      decision: "Use microservices",
      confidence: 0.9,
      reason: "raft consensus reached (confidence: 0.9)",
    }
    const result = augmentPromptWithConsensus("Build the API", gate)
    expect(result).toContain("Build the API")
    expect(result).toContain("[SWARM CONSENSUS]")
    expect(result).toContain("Use microservices")
    expect(result).toContain("0.90")
  })
})
