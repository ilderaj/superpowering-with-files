# Artifact and delivery

## When to load

Load this reference when an Office artifact must be inspected, accepted, or delivered, or when a local file could be mistaken for recipient-visible evidence.

## Native artifact checks

Open or parse the artifact with its native tool and verify the affected pages, slides, sheets, or document structure. Check the requested format, source notes or citation markers, populated ranges, and content boundaries. A successful write or generation log proves only `generated`; it does not prove that the artifact opened, rendered, was accepted, or was delivered.

## Numeric and formula checks

For spreadsheets, verify typed inputs, formulas, number formats, recalculated or cached results, formula errors, and reconciled totals. Confirm that displayed values agree with the formula and its inputs. Record the affected range and coverage when the check is localized.

## Language, link, and accessibility checks

Check headings, table headers, language, source links, citation markers, meaningful image descriptions, searchable text, readable contrast, and unclipped content. Repair a failure at the source and rerun the affected native check; broaden coverage when pagination, shared styles, master layouts, or dependencies make the impact uncertain.

## Visual design checks

When visual quality is part of the artifact's acceptance - a deck, one-pager, dashboard, or prototype - apply the `ux-design` method when the Host makes it available: fix the intended reader and the observable layout decisions first, name the failure modes to avoid, then inspect the rendered pages, slides, or screens instead of the source markup. Check hierarchy, alignment, spacing consistency, contrast, clipping, and reachable states where they apply. The evidence states below apply unchanged: an exported preview is `rendered` or `inspected` at best, never `accepted` or `delivered`.

## Delivery evidence states

Keep these states separate and record evidence for each one: `generated`, `opened`, `rendered`, `accepted`, and `delivered`. A file path, queued open request, local preview, or generated output cannot stand in for a later state. `accepted` requires the stated acceptance check; `delivered` requires evidence that the intended recipient or destination received the artifact.

## O4 live gate

O4 passes only when an authorized, authenticated live Host automation has been created and executed and recipient-visible delivery evidence can be read back. `queued`, `local`, and `generated` evidence is insufficient. Without authorized live input or recipient-visible readback, mark O4 `blocked` or `unknown` and do not create a mock delivery result.

## Stop and rollback

Stop at the last supported evidence state when a native check, source, recipient, authorization, or readback is missing. Preserve the failure and affected scope. If an artifact or delivery step fails, repair or roll back the affected source or artifact, then rerun the relevant native checks before advancing its state.
