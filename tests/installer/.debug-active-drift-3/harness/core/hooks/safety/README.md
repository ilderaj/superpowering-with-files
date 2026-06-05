# Harness Safety Hooks

These hooks enforce safety policy at session start and before tool execution.

- `pretool-guard.sh` evaluates the current working directory, command intent, and risk-assessment state.
- `session-checkpoint.sh` triggers a best-effort checkpoint before risky sessions continue.
