---
name: code-review
description: Review an unstaged, staged, commit, branch, or PR diff against repository standards and the bound requirements.
---

# Code Review

Review a fixed work product on two independent axes: **Standards** (repository rules and code/test quality) and **Spec** (the authorized behavior and scope). Review is read-only unless fixes are also authorized.

## Bind the review

1. Derive the requested scope, known base, head, and spec from the current user request, task assignment, and existing task records. Reuse an already bound base or spec before searching or asking. Do not create planning files or a new tracker to run this method.
2. Read [DIFF-SCOPES.md](DIFF-SCOPES.md) for the requested mode. Inspect status, resolve refs to commit IDs, and capture the exact diff and affected paths. Keep staged and unstaged changes distinct; include untracked files explicitly when work-in-progress scope includes them. An empty diff is a no-change result, not an error or a reason to broaden scope.
3. Use the bound request and accepted task requirements as the primary Spec. Then consult a supplied spec path, linked issue/PR, or matching existing project specification. Use an available read-only connector or CLI for linked sources; no assumed tracker file or mandatory tool. Ask only when a material scope/base/spec ambiguity remains after inspecting that evidence. If no spec is available, report **Spec: not assessed — no spec available**, with the reason.
4. Identify applicable repository instructions, standards, conventions, and ADRs. Use [REVIEW-AXES.md](REVIEW-AXES.md) for test quality, smell heuristics, and detailed evidence/reporting guidance.

## Review and report

Run Standards and Spec separately in the main session. Optional authorized subagents may review bounded axes with the same captured diff and exact source references; fan-out and model selection are not prerequisites.

Verify findings against code and requirements. Report each under **Standards** or **Spec** with severity, location, evidence, and impact. Keep separate counts and verdicts so success on one axis cannot mask failure on the other. Label unavailable test or source evidence explicitly.

Record the selected mode, resolved commits (where applicable), exact diff command, and verification actually run. For mutable index/worktree inputs, retain the captured patch or its digest with the review and recheck the same scope before reporting. If it changed, qualify the report as a review of the captured snapshot or refresh the affected review. Do not reset, stash, switch branches, post a review, or modify code merely to inspect it.
