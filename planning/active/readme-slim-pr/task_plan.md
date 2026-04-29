# Task Plan: Simplify README while preserving key diagrams

## Goal
Condense the repository README so the prose is materially shorter while preserving the main workflow and structure diagrams plus useful iconography, then verify, commit, push, and open a pull request.

## Current State
Status: waiting_review
Archive Eligible: no
Close Reason:

## Current Phase
Phase 5

## Phases

### Phase 1: Requirements & Discovery
- [x] Understand user intent
- [x] Identify constraints and requirements
- [x] Document findings in findings.md
- **Status:** complete

### Phase 2: Planning & Structure
- [x] Define technical approach
- [x] Decide what README content to keep, compress, or remove
- [x] Document decisions with rationale
- **Status:** complete

### Phase 3: Implementation
- [x] Rewrite README sections with tighter copy
- [x] Preserve the main flow and structure diagrams
- [x] Keep key icons and visual cues where they aid scanning
- **Status:** complete

### Phase 4: Testing & Verification
- [x] Review markdown rendering and links
- [x] Run repository verification relevant to the change
- [x] Check git diff for scope control
- **Status:** complete

### Phase 5: Delivery
- [x] Commit the README change
- [x] Push the branch
- [x] Create the pull request
- **Status:** complete

## Risk Assessment

| 风险 | 触发条件 | 影响范围 | 缓解 / 已落盘的回退方案 |
|---|---|---|---|
| README oversimplifies important usage details | Removing sections that still orient new users | User onboarding clarity | Keep quick start, command surface, docs links, and both mermaid diagrams |
| PR step blocked by repo state | Missing upstream or auth issue | Delivery phase | Verify branch and remote state before commit/push/PR |

## Key Questions
1. Which sections are essential for first-time understanding?
2. Which narrative details can be replaced by shorter bullets and links?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep Quick Start, diagrams, commands, docs, and safety overview | These carry most onboarding value with minimal prose |
| Compress long governance explanations into bullets | README should orient, not fully restate internal policy |
| Preserve the skill-root strategy column | Existing policy-render tests assert the materialized strategy text in README |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| README rewrite removed a compatibility-sensitive table column | 1 | Restored the `Strategy` column and `materialized` values before rerunning verify |

## Notes
- Keep edits focused on README and task-tracking files unless validation requires more.