# HEARTBEAT.md

## Demo Refinement (overnight 2026-03-08)
- Review and improve `demo/orchestrator.mjs` — look for rough edges, better logging, clearer narrative
- Test edge cases in `demo/agent.mjs` protocol handler
- Consider adding: rejection scenarios (bad signature, expired challenge, unauthorized message)
- Consider: a web-based visualization that could run alongside the CLI demo
- Update the dashboard (`services/dashboard/`) to integrate with the demo protocol
- Keep changes incremental — commit after each improvement
