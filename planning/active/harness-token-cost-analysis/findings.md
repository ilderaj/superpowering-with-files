# Findings: Harness Token Cost Analysis

## Findings Record: 2026-05-20 14:39:18 UTC+8

## Local Harness Evidence
- `harness doctor` result: passed.
- `harness sync dry-run` result summary observed: `create=81 update=0 stale=81`.
- Dry-run structured targets observed: `codex`, `copilot`, `cursor`, `claude-code`.
- Planned artifacts included entry files and hooks/hook scripts, including examples:
  - `~/.codex/AGENTS.md`
  - `~/.claude/CLAUDE.md`
  - `~/.copilot/instructions/harness.instructions.md`
  - `.cursor` hook config paths
- Root repo contains `AGENTS.md`, `CLAUDE.md`, `.harness/`, `.superpowers/`, and `harness/`.

## Initial Token Cost Model

### Ordinary Direct Tasks
Typical sources:
- system/developer prompt and user request
- limited conversation history
- targeted file reads
- targeted shell output
- final answer

Rough order of magnitude noted in analysis:
- Small single-file task: ~5k-30k input, ~1k-8k output.
- Medium 2-5 file task: ~20k-80k input, ~5k-20k output.
- Analysis/research answer: ~5k-50k input, ~2k-15k output.

### Complex Superpowers/Harness Tasks
Additional sources:
- planner/product-manager context
- developer/generator execution context
- evaluator acceptance context
- task plan/findings/progress files
- IDE-specific entry/rule projections
- skills/superpowers documentation
- verification and retry loops

Rough order of magnitude noted in analysis:
- Small feature, 1-2 loops: ~100k-300k total.
- Multi-component feature, 2-4 loops: ~300k-1M total.
- Complete app / multi-stage build: 1M+ total is plausible.

Main risk: large tool/shell output can dominate all other costs.

## Reddit/Codex Byte-cap Pattern
Pattern from user-provided image:

```bash
COMMAND 2>&1 | head -c 4000
```

Assessment:
- Effective as a prompt-level instruction when placed in Codex `AGENTS.md` because Codex supports `AGENTS.md` project instructions.
- Not a hard enforcement mechanism.
- Good for unknown or potentially huge command output.
- Risk: head-only truncation can cut off the actual error, especially for tests/builds where failure appears late.
- Risk: JSON may become unparsable after byte truncation.
- Risk: upstream process may see SIGPIPE.

## IDE/CLI Evidence Summary

### OpenAI Codex CLI
- Official/project docs support `AGENTS.md`.
- Official/project docs include config/hooks references.
- Source-level evidence reported by researcher: exec output has a larger default byte cap around 1MiB.
- `AGENTS.md` byte-cap instruction is compatible but soft.

### Claude Code
- Official docs support `CLAUDE.md`, `.claude/rules/*.md`, imports, and hooks.
- Hooks can match Bash via PreToolUse/PostToolUse.
- `CLAUDE.md`/rules are context guidance, not hard enforcement.
- Hook enforcement is possible in principle, but requires careful design and testing.

### Cursor
- Official docs support `.cursor/rules` and `AGENTS.md`.
- Official docs support `.cursorignore` and related context exclusions.
- Agent terminal commands are compatible with shell pipelines.
- No confirmed official shell output truncation setting yet.

### Gemini CLI
- Official docs support `GEMINI.md`, custom context file names, custom commands, hooks, `.geminiignore`.
- Official setting `tools.truncateToolOutputThreshold` exists according to researcher verification.
- Strongest native mechanism among surveyed tools for output truncation.

### OpenCode
- Official docs support `AGENTS.md`, fallback to `CLAUDE.md`, `instructions`, custom commands, plugins/hooks.
- `compaction.prune` removes old tool outputs to save tokens.
- No confirmed fixed shell output truncation threshold yet.

## Token Reduction Levers Identified
- Byte-cap unknown/large shell outputs.
- Use IDE-native ignore/exclude files to reduce irrelevant context.
- Keep entry files thin; load detailed skills/rules on demand.
- Preserve summaries of decisions, modified files, verification status, and unresolved issues.
- Avoid full logs, broad grep, huge diffs, and whole-file reads unless required.
- Prefer command-specific wrappers over one global `head -c 4000`.

## Key Judgment
The safest optimization direction is not to remove planning/evaluation layers. It is to reduce noisy tool output and repeated full-context loading while preserving durable decision state.
