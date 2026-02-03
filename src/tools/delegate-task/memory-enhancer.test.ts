import { describe, test, expect } from "bun:test"
import { searchMemoryForTask, storeLearning, augmentPromptWithMemory, type MemorySearchResult } from "./memory-enhancer"
import type { ClaudeFlowMemoryConfig } from "../../claude-flow/types"
import type { ClaudeFlowRuntime } from "../../claude-flow/runtime"

const baseConfig: ClaudeFlowMemoryConfig = {
  enabled: true,
  backend: "hybrid",
  defaultNamespace: "shared",
  maxSearchResults: 5,
  autoStoreLearnings: true,
}

function makeMockRuntime(overrides: Partial<{
  isRunning: boolean
  searchResults: Array<{ key: string; value: string; score: number; namespace: string }>
  storeSuccess: boolean
}> = {}): ClaudeFlowRuntime {
  return {
    isRunning: () => overrides.isRunning ?? true,
    memorySearch: async () => ({
      success: (overrides.searchResults?.length ?? 0) > 0,
      results: overrides.searchResults ?? [],
    }),
    memoryStore: async () => ({
      success: overrides.storeSuccess ?? true,
      key: "test",
      namespace: "shared",
    }),
  } as unknown as ClaudeFlowRuntime
}

describe("searchMemoryForTask", () => {
  //#given memory is disabled
  test("returns early when memory is disabled", async () => {
    const result = await searchMemoryForTask(
      { description: "test", category: "quick" },
      { memoryConfig: { ...baseConfig, enabled: false } },
    )

    expect(result.found).toBe(false)
    expect(result.reason).toBe("memory disabled")
  })

  //#given runtime unavailable
  test("returns early when runtime is unavailable", async () => {
    const result = await searchMemoryForTask(
      { description: "test" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => null },
    )

    expect(result.found).toBe(false)
    expect(result.reason).toBe("runtime unavailable")
  })

  //#given no results found
  test("returns found=false when no results", async () => {
    const runtime = makeMockRuntime({ searchResults: [] })
    const result = await searchMemoryForTask(
      { description: "build auth", category: "ultrabrain" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.found).toBe(false)
    expect(result.resultCount).toBe(0)
  })

  //#given results found
  test("returns formatted context when patterns found", async () => {
    const runtime = makeMockRuntime({
      searchResults: [
        { key: "auth-pattern", value: "Use JWT with refresh tokens", score: 0.92, namespace: "shared" },
        { key: "error-pattern", value: "Wrap in try-catch with custom errors", score: 0.78, namespace: "shared" },
      ],
    })

    const result = await searchMemoryForTask(
      { description: "build auth system", category: "ultrabrain" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.found).toBe(true)
    expect(result.resultCount).toBe(2)
    expect(result.context).toContain("[MEMORY CONTEXT]")
    expect(result.context).toContain("auth-pattern")
    expect(result.context).toContain("0.92")
  })

  //#given runtime throws
  test("handles search errors gracefully", async () => {
    const runtime = {
      isRunning: () => true,
      memorySearch: async () => { throw new Error("db locked") },
    } as unknown as ClaudeFlowRuntime

    const result = await searchMemoryForTask(
      { description: "test" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )

    expect(result.found).toBe(false)
    expect(result.reason).toContain("db locked")
  })
})

describe("storeLearning", () => {
  //#given memory disabled
  test("returns false when memory is disabled", async () => {
    const result = await storeLearning(
      { description: "test", category: "quick", outcome: "success" },
      { memoryConfig: { ...baseConfig, enabled: false } },
    )
    expect(result).toBe(false)
  })

  //#given autoStoreLearnings disabled
  test("returns false when autoStoreLearnings is disabled", async () => {
    const result = await storeLearning(
      { description: "test", category: "quick", outcome: "success" },
      { memoryConfig: { ...baseConfig, autoStoreLearnings: false } },
    )
    expect(result).toBe(false)
  })

  //#given runtime unavailable
  test("returns false when runtime is unavailable", async () => {
    const result = await storeLearning(
      { description: "test", category: "quick", outcome: "success" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => null },
    )
    expect(result).toBe(false)
  })

  //#given successful store
  test("stores learning successfully", async () => {
    const runtime = makeMockRuntime({ storeSuccess: true })
    const result = await storeLearning(
      { description: "Built auth system", category: "ultrabrain", outcome: "success", details: "JWT + refresh" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )
    expect(result).toBe(true)
  })

  //#given store throws
  test("handles store errors gracefully", async () => {
    const runtime = {
      isRunning: () => true,
      memoryStore: async () => { throw new Error("disk full") },
    } as unknown as ClaudeFlowRuntime

    const result = await storeLearning(
      { description: "test", category: "quick", outcome: "failure" },
      { memoryConfig: baseConfig },
      { getRuntimeFn: () => runtime },
    )
    expect(result).toBe(false)
  })
})

describe("augmentPromptWithMemory", () => {
  test("returns original prompt when no memory found", () => {
    const mem: MemorySearchResult = { found: false, context: "", resultCount: 0, reason: "no results" }
    expect(augmentPromptWithMemory("original prompt", mem)).toBe("original prompt")
  })

  test("augments prompt with memory context", () => {
    const mem: MemorySearchResult = {
      found: true,
      context: "\n---\n[MEMORY CONTEXT] Found 2 relevant pattern(s)\n1. [auth] JWT pattern\n---",
      resultCount: 2,
      reason: "found 2 pattern(s)",
    }
    const result = augmentPromptWithMemory("Build the API", mem)
    expect(result).toContain("Build the API")
    expect(result).toContain("[MEMORY CONTEXT]")
    expect(result).toContain("JWT pattern")
  })
})
