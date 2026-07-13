---
name: office-work-quality
description: Use when creating, editing, or accepting Word, spreadsheet, presentation, or PDF artifacts that need source, data, rendering, and delivery QA.
---

# Office Work Quality

## Outcome Contract

- **Outcome:** the requested Office artifact is produced through the matching host-native skill with source, data, content, and rendered-layout quality controlled.
- **Done when:** the artifact satisfies the recorded acceptance criteria and its risk-bearing content and rendered form have been inspected.
- **Evidence:** source and data provenance, formula or citation checks where applicable, rendered inspection results, and the final artifact path.
- **Output:** a validated document, spreadsheet, presentation, or PDF plus concise acceptance evidence.

## When to Use

- Creating, editing, or accepting a Word document, spreadsheet, presentation, or PDF.
- The deliverable needs source, citation, formula, data-quality, accessibility, template, or rendered-layout verification.
- A tracked Office workflow needs one acceptance boundary across host-native artifact skills.

Use the host-native artifact skill that matches the deliverable: `documents`, `spreadsheets`, `presentations`, or `pdf`. This skill coordinates their acceptance boundary; it does not replace them or create a second task authority.

1. Capture scope, audience, source/data provenance, and acceptance criteria in the active task trio when the work is tracked.
2. Build with the artifact-specific skill and preserve formulas, citations, template constraints, and accessible structure.
3. Validate the artifact's risk-bearing content: cited claims against sources, spreadsheet formulas and data quality, and presentation/document hierarchy.
4. Render, open, or inspect the produced artifact before completion. For PDFs, inspect the rendered pages; for slides and documents, inspect layout; for sheets, inspect formulas, values, and charts.
5. Report the artifact path and the actual validation evidence. A generated file alone is not completion proof.

Keep Office work independent from coding profile choices. Do not use Matt tickets, Superpowers plans, or generated output as durable task authority; `planning/active/<task-id>/` remains authoritative for tracked work.

## Common Mistakes

- Treating file generation as completion without opening or rendering the artifact.
- Skipping source, citation, formula, or data-quality checks because the layout looks correct.
- Using this router instead of the matching host-native artifact skill.
- Allowing coding-profile choices or generated output to become Office task authority.
