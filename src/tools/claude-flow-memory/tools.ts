/**
 * Claude-Flow Memory Tools
 *
 * Vector memory operations via claude-flow runtime.
 * Supports semantic search, namespaced storage, and cross-session learning.
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { getClaudeFlowRuntime, CF_UNAVAILABLE_PREFIX } from "../../claude-flow"

const CF_UNAVAILABLE = `${CF_UNAVAILABLE_PREFIX} Claude-Flow runtime not available. Enable it in sisyphus-flow.json: { "claude_flow": { "enabled": true } }`

function requireRuntime() {
  const runtime = getClaudeFlowRuntime()
  if (!runtime || !runtime.isRunning()) return null
  return runtime
}

export const cf_memory_store: ToolDefinition = tool({
  description:
    "Store knowledge in claude-flow's vector memory. " +
    "Use namespaces to organize (e.g., 'shared', 'security', 'performance'). " +
    "Stored entries are semantically searchable via cf_memory_search.",
  args: {
    key: tool.schema.string().describe("Storage key (e.g., 'auth/jwt-pattern', 'bugs/fix-123')"),
    value: tool.schema.string().describe("The knowledge/content to store"),
    namespace: tool.schema
      .string()
      .default("shared")
      .describe("Namespace for organization (e.g., 'shared', 'security', 'performance')"),
    tags: tool.schema
      .string()
      .optional()
      .describe("Comma-separated tags for filtering (e.g., 'auth,jwt,security')"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.memoryStore({
      key: args.key,
      value: args.value,
      namespace: args.namespace,
      tags: args.tags?.split(",").map(t => t.trim()),
    })

    if (!result.success) {
      return `Memory store failed: ${result.error}`
    }

    return `Stored "${args.key}" in namespace "${result.namespace}".`
  },
})

export const cf_memory_search: ToolDefinition = tool({
  description:
    "Semantically search claude-flow's vector memory. " +
    "Finds relevant knowledge stored across sessions. " +
    "Use before starting tasks to find prior learnings, patterns, and decisions.",
  args: {
    query: tool.schema.string().describe("Semantic search query (natural language)"),
    namespace: tool.schema
      .string()
      .default("shared")
      .describe("Namespace to search in"),
    limit: tool.schema
      .number()
      .default(10)
      .describe("Maximum results to return"),
    tags: tool.schema
      .string()
      .optional()
      .describe("Filter by tags (comma-separated)"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.memorySearch({
      query: args.query,
      namespace: args.namespace,
      limit: args.limit,
      tags: args.tags?.split(",").map(t => t.trim()),
    })

    if (!result.success) {
      return `Memory search failed: ${result.error}`
    }

    if (result.results.length === 0) {
      return `No results found for "${args.query}" in namespace "${args.namespace}".`
    }

    const lines = [`Found ${result.results.length} result(s) for "${args.query}":\n`]
    for (const r of result.results) {
      lines.push(`[${r.key}] (score: ${r.score.toFixed(2)})`)
      lines.push(`  ${r.value.slice(0, 200)}${r.value.length > 200 ? "..." : ""}`)
      if (r.tags?.length) lines.push(`  Tags: ${r.tags.join(", ")}`)
      lines.push("")
    }

    return lines.join("\n")
  },
})

export const cf_memory_retrieve: ToolDefinition = tool({
  description: "Retrieve a specific entry from claude-flow memory by key.",
  args: {
    key: tool.schema.string().describe("The key to retrieve"),
    namespace: tool.schema
      .string()
      .default("shared")
      .describe("Namespace"),
  },
  execute: async (args) => {
    const runtime = requireRuntime()
    if (!runtime) {
      return CF_UNAVAILABLE
    }

    const result = await runtime.memoryRetrieve({ key: args.key, namespace: args.namespace })
    if (!result.success) {
      return `Retrieve failed: ${result.error}`
    }

    return result.value ?? "(empty)"
  },
})
