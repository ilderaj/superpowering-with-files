# Findings & Decisions

## Requirements
- Simplify the README substantially.
- Preserve the main workflow diagram and repository structure diagram.
- Preserve relevant iconography / visual cues where useful.
- Complete the change through commit, push, and PR creation.

## Research Findings
- The current README is comprehensive but repeats governance details better suited for linked docs.
- The main onboarding value comes from the opening summary, quick start, diagrams, command list, and docs links.
- Mermaid diagrams already communicate the workflow and repo shape effectively, so surrounding prose can be reduced.
- The installer policy-render tests assert README content for the skill-root table, so that table cannot be simplified past the `Strategy: materialized` column without updating tests.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Rewrite README in place instead of partial line edits | A tighter rewrite is cleaner than shaving many scattered paragraphs |
| Keep section headings but reduce explanatory paragraphs to short bullets | Preserves scanability and existing anchors while shortening the document |
| Keep the skill-root table in a test-compatible format | Avoids breaking repository assertions for rendered policy documentation |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Initial README simplification removed a test-sensitive strategy column | Restored the column and reran `npm run verify` successfully |

## Destructive Operations Log
| Command | Target | Checkpoint | Rollback |
|---------|--------|------------|----------|

## Resources
- README: /Users/jared/SuperpoweringWithFiles/README.md
- Verify script: /Users/jared/SuperpoweringWithFiles/package.json

## Visual/Browser Findings
- The current README already uses two Mermaid diagrams that should remain.

---
*Update this file after every 2 view/browser/search operations*
*This prevents visual information from being lost*