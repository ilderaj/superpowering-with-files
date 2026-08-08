---
name: office
description: Source-backed office artifact quality for documents, spreadsheets, presentations, and PDF review.
---

# Office Capability

## Purpose

The office capability turns source-backed work into reviewable office artifacts. It owns the artifact quality contract, while the Host owns execution and native tool access. Artifact generation alone is not completion.

## Route

Classify the requested artifact before choosing an execution path, and route source-backed work to the matching Host-native capability:

- documents: Host-native document creation and inspection
- spreadsheets: Host-native spreadsheet creation, formula inspection, and recalculation
- presentations: Host-native presentation creation, speaker-note/source inspection, and slide rendering
- PDF: Host-native PDF creation, text extraction, and page rendering

Keep the route explicit when a request combines formats. Do not substitute a generic text export for the requested office format.

## Quality Loop

Inspect the current source, data, content, constraints, and intended audience first. Establish the source or data basis before drafting. For every artifact, preserve traceable source markers and run the matching Host-native open or parse check. For every spreadsheet, inspect formulas, typed inputs, number formats, cached or calculated results, and formula errors. For every document, presentation, and PDF, inspect searchable content, citations, page or slide structure, and rendered layout.

The acceptance loop is:

1. source/data/content inspection
2. bounded artifact construction
3. formula or citation verification where applicable
4. native open or parse verification
5. render verification for every page or slide, with every sheet or range visually inspected for spreadsheets
6. accessibility QA for headings, table headers, searchable text, meaningful image descriptions, readable contrast, and unclipped content

Record concrete failures and repair them at the artifact source. A successful file write, non-empty file, or generation log is not completion without the relevant open, render, content, formula, citation, and accessibility evidence.

## Source and Accessibility Contract

Use source notes or citation markers that a reviewer can search and trace. Keep formulas auditable: inputs are typed values, derived values are formulas, and displayed results are non-empty and reconciled. Use real heading hierarchy and table headers where the format supports them. Give non-decorative images meaningful alternative text. Keep text searchable in the final PDF and avoid clipped, overlapping, or unreadable content in rendered output.

## External and Durable Boundaries

Sending, publishing, sharing, uploading, or otherwise writing an artifact to an external system requires both supported Host capability and the applicable human gate. This capability never grants that permission.

The planning Trio is the sole durable task authority. The office capability owns no worker lifecycle, worker or subagent identity, requested or actual model evidence, renderer state, connector state, runtime state, cache, registry, receipt, or sidecar. The Host owns worker and subagent lifecycle, requested and actual model evidence, permissions, continuation, and external or human gates. Worker completion is a candidate only; Chief performs acceptance and Trio writeback.

## Return Contract

Return the artifact paths, source or data basis, formula and citation evidence, native open or parse results, render results, accessibility findings, requested and authenticated actual model evidence, unresolved risks, and an explicit candidate or blocker status. If a required native capability or proof surface is unavailable, stop with a bounded blocker rather than claiming completion.
