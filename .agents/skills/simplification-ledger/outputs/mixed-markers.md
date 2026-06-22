## Scenario
The repo contains one valid slash-style marker and one valid hash-style marker.

## Ledger
file: src/a.js
- line: 1 | simplification: single-pass scan | ceiling: single-pass only | upgrade trigger: batching is required

file: scripts/b.py
- line: 1 | simplification: local scan scope | ceiling: local scan only | upgrade trigger: cross-workspace support is needed

## Summary
Read-only ledger report.
rows: 2
