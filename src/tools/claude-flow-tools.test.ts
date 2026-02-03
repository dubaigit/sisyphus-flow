import { describe, it, expect, beforeEach } from "bun:test"
import { claudeFlowTools } from "./index"
import { _resetRuntimeForTest, CF_UNAVAILABLE_PREFIX } from "../claude-flow"

const EXPECTED_TOOL_KEYS = [
  "cf_swarm_init",
  "cf_swarm_status",
  "cf_swarm_stop",
  "cf_agent_spawn",
  "cf_memory_store",
  "cf_memory_search",
  "cf_memory_retrieve",
  "cf_hive_mind_consensus",
  "cf_security_scan",
]

/** Minimal ToolContext stub for execute() calls */
const stubCtx = {
  sessionID: "test-session",
  messageID: "test-msg",
  agent: "test-agent",
  directory: "/tmp/test",
} as never

describe("claudeFlowTools", () => {
  beforeEach(() => {
    //#given - singleton reset so no runtime is available
    _resetRuntimeForTest()
  })

  it("exports exactly 9 expected tool keys", () => {
    //#when
    const keys = Object.keys(claudeFlowTools).sort()

    //#then
    expect(keys).toEqual(EXPECTED_TOOL_KEYS.sort())
    expect(keys.length).toBe(9)
  })

  it("all tools have description and execute function", () => {
    //#then
    for (const [, tool] of Object.entries(claudeFlowTools)) {
      expect(tool.description).toBeDefined()
      expect(typeof tool.description).toBe("string")
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.execute).toBeDefined()
      expect(typeof tool.execute).toBe("function")
    }
  })

  describe("when runtime is unavailable", () => {
    //#given - no runtime (singleton is null after _resetRuntimeForTest)

    it("cf_swarm_init returns CF_UNAVAILABLE", async () => {
      //#when
      const result = await claudeFlowTools.cf_swarm_init.execute({ topology: "hierarchical", max_agents: 8, strategy: "specialized", consensus: "raft" }, stubCtx)
      //#then
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_swarm_status returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_swarm_status.execute({}, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_swarm_stop returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_swarm_stop.execute({}, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_agent_spawn returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_agent_spawn.execute({ type: "coder" }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_memory_store returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_memory_store.execute({ key: "test", value: "val", namespace: "shared" }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_memory_search returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_memory_search.execute({ query: "test", namespace: "shared", limit: 10 }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_memory_retrieve returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_memory_retrieve.execute({ key: "test", namespace: "shared" }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_hive_mind_consensus returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_hive_mind_consensus.execute({ question: "test?", algorithm: "raft", topology: "hierarchical" }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("cf_security_scan returns CF_UNAVAILABLE", async () => {
      const result = await claudeFlowTools.cf_security_scan.execute({ target: ".", depth: "standard", type: "all", fix: false }, stubCtx)
      expect(result).toContain(CF_UNAVAILABLE_PREFIX)
    })

    it("all 9 tools return identical error prefix", async () => {
      //#when
      const minArgs: Record<string, Record<string, unknown>> = {
        cf_swarm_init: { topology: "hierarchical", max_agents: 8, strategy: "specialized", consensus: "raft" },
        cf_swarm_status: {},
        cf_swarm_stop: {},
        cf_agent_spawn: { type: "coder" },
        cf_memory_store: { key: "k", value: "v", namespace: "shared" },
        cf_memory_search: { query: "q", namespace: "shared", limit: 10 },
        cf_memory_retrieve: { key: "k", namespace: "shared" },
        cf_hive_mind_consensus: { question: "q?", algorithm: "raft", topology: "hierarchical" },
        cf_security_scan: { target: ".", depth: "standard", type: "all", fix: false },
      }

      const results = await Promise.all(
        EXPECTED_TOOL_KEYS.map(async (key) => {
          const tool = claudeFlowTools[key]
          const result = await tool.execute(minArgs[key] as never, stubCtx)
          return { key, result }
        })
      )

      //#then
      for (const { result } of results) {
        expect(result.startsWith(CF_UNAVAILABLE_PREFIX)).toBe(true)
      }
    })
  })
})
