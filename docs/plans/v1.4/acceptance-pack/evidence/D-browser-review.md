# D Chief browser supplement

The executor's file URL was rejected by the browser policy, so the original first run remains `blocked`. Chief served the unchanged preview through a loopback HTTP server and inspected all four states.

- Normal showed T100 as 123.45 GBP and retained T101 as `review_required`.
- Loading showed loading semantics; empty showed the empty message and zero count.
- Error resolved to a retry action; clicking retry returned to loading and then normal.
- Clicking T100 exposed the local detail entry. The mock fallback is explicitly not a real detail service.

The handoff contains the existing detail API, latest-request guard, owner, pending implementer, implementation order and test steps. Exact 1280px and live-backend race behavior were not exercised.
