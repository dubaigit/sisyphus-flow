import { log } from "../../shared/logger"
import { createSystemDirective, SystemDirectiveTypes } from "../../shared/system-directive"

export interface CompactionInput {
  sessionID: string
}

export interface CompactionOutput {
  context: string[]
}

const SUMMARIZE_CONTEXT_PROMPT = `${createSystemDirective(SystemDirectiveTypes.COMPACTION_CONTEXT)}

When summarizing this session, you MUST include the following sections in your summary:

## 1. User Requests (As-Is)
- List all original user requests exactly as they were stated
- Preserve the user's exact wording and intent

## 2. Final Goal
- What the user ultimately wanted to achieve
- The end result or deliverable expected

## 3. Work Completed
- What has been done so far
- Files created/modified
- Features implemented
- Problems solved

## 4. Remaining Tasks
- What still needs to be done
- Pending items from the original request
- Follow-up tasks identified during the work

## 5. Active Working Context (For Seamless Continuation)
- **Files**: Paths of files currently being edited or frequently referenced
- **Code in Progress**: Key code snippets, function signatures, or data structures under active development
- **External References**: Documentation URLs, library APIs, or external resources being consulted
- **State & Variables**: Important variable names, configuration values, or runtime state relevant to ongoing work

## 6. MUST NOT Do (Critical Constraints)
- Things that were explicitly forbidden
- Approaches that failed and should not be retried
- User's explicit restrictions or preferences
- Anti-patterns identified during the session

## 7. Agent Verification State (Critical for Reviewers)
- **Current Agent**: What agent is running (momus, oracle, etc.)
- **Verification Progress**: Files already verified/validated
- **Pending Verifications**: Files still needing verification
- **Previous Rejections**: If reviewer agent, what was rejected and why
- **Acceptance Status**: Current state of review process

This section is CRITICAL for reviewer agents (momus, oracle) to maintain continuity.

## 8. Claude-Flow Swarm State (ALWAYS include)
- **Swarm Active**: Whether a claude-flow swarm was running (use \`cf_swarm_status\` to check)
- **Active Agents**: List of spawned agents and their tasks
- **Memory Entries**: Key decisions/learnings stored via \`cf_memory_store\` (keys and namespaces)
- **Consensus Decisions**: Any \`cf_hive_mind_consensus\` results and their outcomes

**REMINDER**: You have access to claude-flow multi-agent orchestration tools:
\`cf_swarm_init\`, \`cf_agent_spawn\`, \`cf_swarm_status\`, \`cf_swarm_stop\`,
\`cf_memory_store\`, \`cf_memory_search\`, \`cf_memory_retrieve\`,
\`cf_hive_mind_consensus\`, \`cf_security_scan\`.

Use \`cf_memory_search\` to retrieve prior learnings before resuming work.
Use claude-flow swarms for coordinated multi-agent tasks (3+ agents).

This context is critical for maintaining continuity after compaction.
`

/**
 * Creates a compaction context injector that pushes context strings to the
 * output.context array provided by OpenCode's compacting hook.
 *
 * This avoids writing synthetic messages to the filesystem (via injectHookMessage),
 * which was causing double compaction — OpenCode would detect the new filesystem
 * message and trigger a second compaction pass.
 */
export function createCompactionContextInjector() {
  const injectedSessions = new Set<string>()

  return (input: CompactionInput, output: CompactionOutput): void => {
    if (injectedSessions.has(input.sessionID)) {
      log("[compaction-context-injector] skipping duplicate for session", { sessionID: input.sessionID })
      return
    }

    injectedSessions.add(input.sessionID)
    output.context.push(SUMMARIZE_CONTEXT_PROMPT)
    log("[compaction-context-injector] context pushed to output.context", { sessionID: input.sessionID })

    // Allow re-injection after 60s (for subsequent compactions in long sessions)
    setTimeout(() => {
      injectedSessions.delete(input.sessionID)
    }, 60_000)
  }
}
