// swf-dsh host-side service surface (Slice 1).
//
// Seam notes (recorded in the Slice 1/2 candidate reports): the accepted
// feasibility report (decision 12) named `conversationEvents` as the
// auto-detect interception surface. Verified facts from the dsh source
// (commit 47f943859bef60e4160492346772ded9b24f765a, packages/client/**) show
// that `conversationEvents` and `inputTriggers` are client/UI-side services
// that the CLI host context may not provide. The plugin therefore injects the
// host-side service surface instead: `sessions` (session lifecycle events,
// auto-detect trigger), `commands` (/swf command surface), plus `skills`,
// `tokenMeter`, and `approval`. The detection behavior (planning trio or
// .swf-task marker; non-SWF sessions pass through transparently) is unchanged.
//
// All chain imports here are type-only (`import type`), so the plugin keeps
// zero runtime dependency beyond the pinned @deepseek-ai/dsh anchor; the
// packages below are devDependencies that exist in the dsh dependency chain.
//
// Slice 2: ctx.subagents (dsh-subagent) is the visible-worker dispatch seam
// (report decision 7 + section 4 rewrite). The plugin does NOT add subagents
// to inject: the inject surface stays the Slice 1 verified list, and the
// dispatcher resolves the service defensively (subagentsServiceOf) so an
// unmounted host fails closed with manual_pending instead of throwing at
// plugin load. Types come from the canonical pinned chain packages
// (dsh-subagent / dsh-agent / dsh-llm, all 0.1.0-rc.6).

import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import type { CommandInvocation, CommandResult, CommandRuntime } from '@deepseek-ai/dsh-commands';
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent, SessionHeader, SessionStore } from '@deepseek-ai/dsh-session';
import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill';
import type {
  SubagentRun,
  SubagentRunInfo,
  SubagentRuntime,
  SubagentStartRequest
} from '@deepseek-ai/dsh-subagent';
import type { TokenMeasurement, TokenMeter } from '@deepseek-ai/dsh-token-meter';
import type { ApprovalOutcome, ApprovalPolicy, ApprovalRequest, ApprovalService } from '@deepseek-ai/dsh-user-approval';

export type { Context };
export type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
export type { CommandInvocation, CommandResult, CommandRuntime } from '@deepseek-ai/dsh-commands';
export type { ContentBlock } from '@deepseek-ai/dsh-llm';
export type { Session, SessionEvent, SessionHeader, SessionStore } from '@deepseek-ai/dsh-session';
export type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill';
export type {
  SubagentRun,
  SubagentRunInfo,
  SubagentRuntime,
  SubagentStartRequest
} from '@deepseek-ai/dsh-subagent';
export type { TokenMeasurement, TokenMeter } from '@deepseek-ai/dsh-token-meter';
export type { ApprovalOutcome, ApprovalPolicy, ApprovalRequest, ApprovalService } from '@deepseek-ai/dsh-user-approval';

/** Command definition shape used by the dsh commands registry. */
export interface SwfCommandDefinition {
  readonly name: string;
  readonly description: string;
  readonly input?: { readonly hint: string };
  readonly handler: (invocation: CommandInvocation) => CommandResult | Promise<CommandResult>;
}

/** The exact service surface swf-dsh requires from the dsh host context. */
export interface SwfDshContext extends Context {
  sessions: SessionStore;
  commands: CommandRuntime;
  skills: SkillRegistry;
  tokenMeter: TokenMeter;
  approval: ApprovalService;
}

/**
 * Defensive access to the ctx.subagents seam. The dsh-subagent package
 * augments cordis Context with a required subagents service; a host that has
 * not mounted it (or a minimal test mock) must fail closed rather than throw.
 * The dispatcher checks this before every dispatch.
 */
export function subagentsServiceOf(ctx: Context): SubagentRuntime | undefined {
  const candidate = (ctx as { subagents?: SubagentRuntime }).subagents;
  return candidate && typeof candidate.start === 'function' && typeof candidate.list === 'function'
    && typeof candidate.getProvider === 'function'
    ? candidate
    : undefined;
}
