# Cloud Safe Policy

- Prefer ephemeral workspace paths and avoid writing agent state outside the mounted workspace when cloud-safe is active.
- Do not install global packages, CLIs, or language runtimes while cloud-safe is active.
- Do not read or modify `~/.ssh`, `~/.aws`, cloud credential stores, or host-only secrets from a cloud workspace.
- Treat outbound network writes, remote shell pipes, and credential-bearing automation as ask-or-deny operations.
