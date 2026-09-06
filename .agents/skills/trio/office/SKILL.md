---
name: office
description: Source-backed office artifacts with verification scaled to change and risk.
---

# Office

Inspect intended audience, existing artifact, source/data basis, constraints, and delivery format before drafting. Route through the matching available Host-native capability:

- documents: Host-native document creation, parsing, and layout inspection.
- spreadsheets: typed inputs, formula inspection, recalculation, and displayed results.
- presentations: slide construction, source/speaker notes, and rendering.
- PDF: native creation, searchable text extraction, and page rendering.

Keep requested formats and traceable source notes or citation markers; verify claims against their sources. In spreadsheets, derived values are formulas; verify inputs, number formats, calculated/cached results, formula errors, and reconciled totals. A successful file write or generation log is not completion.

Run a native open or parse check on the final artifact. Choose visual and content coverage by change:

- New artifacts or full-layout changes: inspect every page and slide; inspect every populated sheet and relevant output range in spreadsheets.
- A localized patch: inspect affected pages, slides, sheets or ranges and their dependencies, including dependent formulas and totals; record the coverage and why it is sufficient.
- Pagination, global styles, master slides, shared formulas, or uncertain downstream effects broaden verification to all potentially affected output; use full coverage when the impact cannot be bounded.

Verify citations and accessibility in that scope: headings, table headers, searchable text, meaningful image descriptions, readable contrast, and unclipped content. Repair failures at the source, then recheck affected output. Reuse unchanged valid evidence; rerender or recalculate when the change or uncertainty invalidates it. Report missing native proof as a bounded blocker or explicit verification limit, never as completed QA.

Direct work can complete after relevant artifact verification. Delegated primary work returns a candidate for Chief acceptance and Trio writeback. For tracked work the three planning files remain the sole durable authority. The Host owns native tools, lifecycle, permissions, and external gates. Honor existing authorization for its scope; sending, publishing, sharing, or uploading still needs supported Host capability and the applicable human gate.

Return artifact paths, source/data basis, verified coverage, formula/citation/open/render/accessibility results, and unresolved limitations. Do not claim an external delivery from local generation evidence.

When recovering an office task, read the bound Trio and preserve its current scope and source decisions. Keep the evidence labels `generated`, `opened`, `rendered`, `accepted`, and `delivered` separate: each describes its own event and scope. A queued open request or a file existing on disk is not proof of a visible delivery. If a source, page, sheet, formula, citation, or delivery gate is unavailable, record the affected limit and stop the claim at that boundary.
