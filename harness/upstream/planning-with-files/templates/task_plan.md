# Task Plan: [Brief Description]
<!-- 
  WHAT: This is your roadmap for the entire task. Think of it as your "working memory on disk."
  WHY: After 50+ tool calls, your original goals can get forgotten. This file keeps them fresh.
  WHEN: Create this FIRST, before starting any work. Update after each phase completes.
-->

## Goal
<!-- 
  WHAT: One clear sentence describing what you're trying to achieve.
  WHY: This is your north star. Re-reading this keeps you focused on the end state.
  EXAMPLE: "Create a Python CLI todo app with add, list, and delete functionality."
-->
[One sentence describing the end state]

## Current State
<!--
  WHAT: Explicit lifecycle state for this task.
  WHY: Completed-looking phases are not enough to archive safely. Archive only after
       the task is intentionally closed and marked eligible.
  STATUS VALUES:
  - active: Work is ongoing
  - blocked: Work cannot continue without external input
  - waiting_review: Implementation is done but needs review
  - waiting_execution: Plan is ready but execution has not started
  - waiting_integration: Work is done but not integrated
  - closed: Work is complete and may be archived if Archive Eligible is yes
-->
Status: active
Archive Eligible: no
Close Reason:
Reconcile: open

## Routing Decision
- Selected Route: tracked-lean
- Route Reason: Durable planning is required, but deep reasoning is not yet justified.
- Promotion Trigger: none
- Route Evidence Surface: planning + summary

## Current Phase
<!-- 
  WHAT: Which phase you're currently working on (e.g., "Phase 1", "Phase 3").
  WHY: Quick reference for where you are in the task. Update this as you progress.
-->
Phase 1

## Phases
<!-- 
  WHAT: Break your task into 3-7 logical phases. Each phase should be completable.
  WHY: Breaking work into phases prevents overwhelm and makes progress visible.
  WHEN: Update status after completing each phase: pending → in_progress → complete
-->

### Phase 1: Requirements & Discovery
<!-- 
  WHAT: Understand what needs to be done and gather initial information.
  WHY: Starting without understanding leads to wasted effort. This phase prevents that.
-->
- [ ] Understand user intent
- [ ] Identify constraints and requirements
- [ ] Document findings in findings.md
- **Status:** in_progress
<!-- 
  STATUS VALUES:
  - pending: Not started yet
  - in_progress: Currently working on this
  - complete: Finished this phase
-->

### Phase 2: Planning & Structure
<!-- 
  WHAT: Decide how you'll approach the problem and what structure you'll use.
  WHY: Good planning prevents rework. Document decisions so you remember why you chose them.
-->
- [ ] Define technical approach
- [ ] Create project structure if needed
- [ ] Document decisions with rationale
- **Status:** pending

### Phase 3: Implementation
<!-- 
  WHAT: Actually build/create/write the solution.
  WHY: This is where the work happens. Break into smaller sub-tasks if needed.
-->
- [ ] Execute the plan step by step
- [ ] Write code to files before executing
- [ ] Test incrementally
- **Status:** pending

### Phase 4: Testing & Verification
<!-- 
  WHAT: Verify everything works and meets requirements.
  WHY: Catching issues early saves time. Document test results in progress.md.
-->
- [ ] Verify all requirements met
- [ ] Document test results in progress.md
- [ ] Fix any issues found
- **Status:** pending

### Phase 5: Delivery
<!-- 
  WHAT: Final review and handoff to user.
  WHY: Ensures nothing is forgotten and deliverables are complete.
-->
- [ ] Review all output files
- [ ] Ensure deliverables are complete
- [ ] Deliver to user
- **Status:** pending

## Execution Contract
<!--
  WHAT: Define heavy-task execution units only when the task needs structured decomposition.
  WHY: This keeps execution intent in authoritative planning rather than scattering it across notes.
  WHEN: Fill this section for heavy tracked tasks; omit or leave as a stub for quick tasks.
-->

### Unit: unit-01
- Kind: implementation
- Status: planned
- Scope:
  - Do: describe the exact deliverable this unit owns
  - Not do: describe the adjacent work this unit must not absorb
- Owner Mode: inline
- Allowed Ops:
  - Files: list the exact files or path classes this unit may touch
  - Commands: list the exact commands this unit may run
  - External effects: say "none" unless the unit is explicitly allowed to change external state
- Dependencies:
  - list required unit ids or evidence refs
- Verification Plan:
  - list the exact command or evidence requirement that proves the unit
- Return Artifacts:
  - name the concrete artifacts, such as patch, report, note, or follow-up
- Integration Target:
  - state exactly where the result must sync back, such as progress.md or findings.md
- Exit Criteria:
  - define the exact condition for moving from done toward verified

<!--
  Optional proof-design note:
  Add a top-level verification-contract section only when the task needs
  explicit proof planning. Quick tasks usually omit it. When you do add one,
  use a `Verification Contract` heading plus one or more `Mode` blocks, and
  fill only the relevant modes.

  Minimal field set per mode:
  - Proof Target
  - Primary Proof
  - Backstop Proof
  - Escalation Trigger
  - Evidence Sink
  - Reconcile Rule
  - Unacceptable Substitute
-->

## Key Questions
<!-- 
  WHAT: Important questions you need to answer during the task.
  WHY: These guide your research and decision-making. Answer them as you go.
  EXAMPLE: 
    1. Should tasks persist between sessions? (Yes - need file storage)
    2. What format for storing tasks? (JSON file)
-->
1. [Question to answer]
2. [Question to answer]

## Decisions Made
<!-- 
  WHAT: Technical and design decisions you've made, with the reasoning behind them.
  WHY: You'll forget why you made choices. This table helps you remember and justify decisions.
  WHEN: Update whenever you make a significant choice (technology, approach, structure).
  EXAMPLE:
    | Use JSON for storage | Simple, human-readable, built-in Python support |
-->
| Decision | Rationale |
|----------|-----------|
|          |           |

## Record Format
<!--
  When adding dated task records, use headings like:
  ## Plan Record: YYYY-MM-DD HH:mm:ss UTC+8
  This keeps multiple task updates from the same date easy to order.
  Prefer `./scripts/harness record --file task_plan` when starting a new dated task-plan block.
-->

## Errors Encountered
<!-- 
  WHAT: Every error you encounter, what attempt number it was, and how you resolved it.
  WHY: Logging errors prevents repeating the same mistakes. This is critical for learning.
  WHEN: Add immediately when an error occurs, even if you fix it quickly.
  EXAMPLE:
    | FileNotFoundError | 1 | Check if file exists, create empty list if not |
    | JSONDecodeError | 2 | Handle empty file case explicitly |
-->
| Error | Attempt | Resolution |
|-------|---------|------------|
|       | 1       |            |

## Notes
<!-- 
  REMINDERS:
  - Update phase status as you progress: pending → in_progress → complete
  - Re-read this plan before major decisions (attention manipulation)
  - Log ALL errors - they help avoid repetition
  - Never repeat a failed action - mutate your approach instead
-->
- Update phase status as you progress: pending → in_progress → complete
- Re-read this plan before major decisions (attention manipulation)
- Log ALL errors - they help avoid repetition
