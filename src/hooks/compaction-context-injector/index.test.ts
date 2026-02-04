import { describe, expect, it, beforeEach } from "bun:test"

// Mock dependencies before importing
import { mock } from "bun:test"

mock.module("../../shared/logger", () => ({
  log: () => {},
}))

mock.module("../../shared/system-directive", () => ({
  createSystemDirective: (type: string) => `[DIRECTIVE:${type}]`,
  SystemDirectiveTypes: {
    TODO_CONTINUATION: "TODO CONTINUATION",
    RALPH_LOOP: "RALPH LOOP",
    BOULDER_CONTINUATION: "BOULDER CONTINUATION",
    DELEGATION_REQUIRED: "DELEGATION REQUIRED",
    SINGLE_TASK_ONLY: "SINGLE TASK ONLY",
    COMPACTION_CONTEXT: "COMPACTION CONTEXT",
    CONTEXT_WINDOW_MONITOR: "CONTEXT WINDOW MONITOR",
    PROMETHEUS_READ_ONLY: "PROMETHEUS READ-ONLY",
  },
}))

import { createCompactionContextInjector } from "./index"
import type { CompactionInput, CompactionOutput } from "./index"

describe("createCompactionContextInjector", () => {
  let injector: ReturnType<typeof createCompactionContextInjector>
  let input: CompactionInput
  let output: CompactionOutput

  beforeEach(() => {
    injector = createCompactionContextInjector()
    input = { sessionID: "test-session" }
    output = { context: [] }
  })

  describe("context injection via output.context", () => {
    it("pushes context to output.context array instead of filesystem", () => {
      //#given - fresh injector and empty output

      //#when
      injector(input, output)

      //#then
      expect(output.context).toHaveLength(1)
      expect(output.context[0]).toContain("When summarizing this session")
    })

    it("does not use injectHookMessage (no filesystem writes)", () => {
      //#given - output.context is the only injection mechanism

      //#when
      injector(input, output)

      //#then - context is pushed to array, not written to filesystem
      expect(output.context.length).toBeGreaterThan(0)
      expect(typeof output.context[0]).toBe("string")
    })
  })

  describe("session deduplication guard", () => {
    it("skips duplicate injection for same session", () => {
      //#given
      injector(input, output)
      expect(output.context).toHaveLength(1)

      //#when - called again for same session
      const output2: CompactionOutput = { context: [] }
      injector(input, output2)

      //#then - second call is skipped
      expect(output2.context).toHaveLength(0)
    })

    it("allows injection for different sessions", () => {
      //#given
      injector(input, output)
      expect(output.context).toHaveLength(1)

      //#when - different session
      const input2: CompactionInput = { sessionID: "other-session" }
      const output2: CompactionOutput = { context: [] }
      injector(input2, output2)

      //#then
      expect(output2.context).toHaveLength(1)
    })
  })

  describe("Agent Verification State preservation", () => {
    it("includes Agent Verification State section in compaction prompt", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("Agent Verification State")
      expect(injectedPrompt).toContain("Current Agent")
      expect(injectedPrompt).toContain("Verification Progress")
    })

    it("includes Momus-specific context for reviewer agents", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("Previous Rejections")
      expect(injectedPrompt).toContain("Acceptance Status")
      expect(injectedPrompt).toContain("reviewer agents")
    })

    it("preserves file verification progress in compaction prompt", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("Pending Verifications")
      expect(injectedPrompt).toContain("Files already verified")
    })
  })

  describe("Claude-Flow swarm state preservation", () => {
    it("includes Claude-Flow Swarm State section in compaction prompt", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("Claude-Flow Swarm State")
      expect(injectedPrompt).toContain("Swarm Active")
      expect(injectedPrompt).toContain("Memory Entries")
    })

    it("includes cf_memory_store and cf_memory_search references in compaction prompt", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("cf_memory_store")
      expect(injectedPrompt).toContain("cf_memory_search")
    })

    it("reminds to use cf_memory_search before resuming work", () => {
      //#given - fresh injector

      //#when
      injector(input, output)

      //#then
      const injectedPrompt = output.context[0] ?? ""
      expect(injectedPrompt).toContain("cf_memory_search")
      expect(injectedPrompt).toContain("prior learnings before resuming")
    })
  })
})
