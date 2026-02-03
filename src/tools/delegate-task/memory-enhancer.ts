/**
 * Memory Enhancer — Layer 5
 *
 * Pre-execution: searches claude-flow memory for similar past tasks/patterns
 * to provide historical context to the agent.
 *
 * Post-execution: stores learnings (task description + outcome) in memory
 * when autoStoreLearnings is enabled, building institutional knowledge.
 *
 * Non-blocking: memory failures never prevent task execution.
 */

import { log } from "../../shared/logger"
import { getClaudeFlowRuntime } from "../../claude-flow"
import type { ClaudeFlowMemoryConfig } from "../../claude-flow/types"

const TAG = "[memory-enhancer]"

export interface MemoryEnhancerConfig {
  memoryConfig: ClaudeFlowMemoryConfig
}

export interface MemorySearchInput {
  description: string
  category?: string
}

export interface MemorySearchResult {
  /** Whether relevant patterns were found */
  found: boolean
  /** Formatted context string to inject into prompt */
  context: string
  /** Number of results found */
  resultCount: number
  /** Reason for outcome */
  reason: string
}

export interface MemoryStoreLearningInput {
  description: string
  category: string
  outcome: "success" | "failure"
  details?: string
}

export interface MemoryEnhancerDeps {
  getRuntimeFn?: typeof getClaudeFlowRuntime
}

/**
 * Search memory for patterns relevant to the current task.
 * Returns formatted context that can be injected into the agent prompt.
 */
export async function searchMemoryForTask(
  input: MemorySearchInput,
  config: MemoryEnhancerConfig,
  deps?: MemoryEnhancerDeps,
): Promise<MemorySearchResult> {
  const { memoryConfig } = config
  const getRuntimeFn = deps?.getRuntimeFn ?? getClaudeFlowRuntime

  // 1. Check if memory is enabled
  if (!memoryConfig.enabled) {
    return { found: false, context: "", resultCount: 0, reason: "memory disabled" }
  }

  // 2. Check runtime
  const runtime = getRuntimeFn()
  if (!runtime?.isRunning()) {
    return { found: false, context: "", resultCount: 0, reason: "runtime unavailable" }
  }

  // 3. Search for relevant patterns
  try {
    const query = input.category
      ? `${input.category}: ${input.description}`
      : input.description

    log(`${TAG} searching memory for: "${query.slice(0, 80)}"`)
    const result = await runtime.memorySearch({
      query,
      namespace: memoryConfig.defaultNamespace,
      limit: Math.min(memoryConfig.maxSearchResults, 5),
    })

    if (!result.success || result.results.length === 0) {
      log(`${TAG} no relevant patterns found`)
      return { found: false, context: "", resultCount: 0, reason: result.error ?? "no results" }
    }

    // Format results into context
    const contextLines = result.results.map((r, i) =>
      `${i + 1}. [${r.key}] (score: ${r.score.toFixed(2)}): ${r.value.slice(0, 200)}`
    )

    const context = `\n---\n[MEMORY CONTEXT] Found ${result.results.length} relevant pattern(s) from past tasks:\n${contextLines.join("\n")}\n---`

    log(`${TAG} found ${result.results.length} relevant patterns`)
    return {
      found: true,
      context,
      resultCount: result.results.length,
      reason: `found ${result.results.length} pattern(s)`,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`${TAG} memory search error: ${msg}`)
    return { found: false, context: "", resultCount: 0, reason: `error: ${msg}` }
  }
}

/**
 * Store a learning after task completion.
 * Called post-execution when autoStoreLearnings is true.
 */
export async function storeLearning(
  input: MemoryStoreLearningInput,
  config: MemoryEnhancerConfig,
  deps?: MemoryEnhancerDeps,
): Promise<boolean> {
  const { memoryConfig } = config
  const getRuntimeFn = deps?.getRuntimeFn ?? getClaudeFlowRuntime

  if (!memoryConfig.enabled || !memoryConfig.autoStoreLearnings) {
    return false
  }

  const runtime = getRuntimeFn()
  if (!runtime?.isRunning()) {
    return false
  }

  try {
    const key = `task-${input.category}-${Date.now().toString(36)}`
    const value = [
      `Category: ${input.category}`,
      `Outcome: ${input.outcome}`,
      `Task: ${input.description}`,
      input.details ? `Details: ${input.details}` : null,
    ].filter(Boolean).join("\n")

    log(`${TAG} storing learning: ${key}`)
    const result = await runtime.memoryStore({
      key,
      value,
      namespace: memoryConfig.defaultNamespace,
      tags: [input.category, input.outcome],
    })

    return result.success
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`${TAG} store error: ${msg}`)
    return false
  }
}

/**
 * Augment a prompt with memory context if any was found.
 */
export function augmentPromptWithMemory(prompt: string, memory: MemorySearchResult): string {
  if (!memory.found || !memory.context) {
    return prompt
  }
  return `${prompt}${memory.context}`
}
