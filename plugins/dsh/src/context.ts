// swf-dsh host-side service surface (Slice 1).
//
// Seam note (recorded in the Slice 1 candidate report): the accepted
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

import type { Context } from '@deepseek-ai/cordis';
import type { CommandInvocation, CommandResult, CommandRuntime } from '@deepseek-ai/dsh-commands';
import type { Session, SessionEvent, SessionHeader, SessionStore } from '@deepseek-ai/dsh-session';
import type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill';
import type { TokenMeasurement, TokenMeter } from '@deepseek-ai/dsh-token-meter';
import type { ApprovalOutcome, ApprovalPolicy, ApprovalRequest, ApprovalService } from '@deepseek-ai/dsh-user-approval';

export type { Context };
export type { CommandInvocation, CommandResult, CommandRuntime } from '@deepseek-ai/dsh-commands';
export type { Session, SessionEvent, SessionHeader, SessionStore } from '@deepseek-ai/dsh-session';
export type { SkillRegistry, SkillSummary } from '@deepseek-ai/dsh-skill';
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
