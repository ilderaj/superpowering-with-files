# Platform Support

Codex is the only managed native target for the Trio workflow.

The managed Codex package contains the Trio entry policy and the `dev`, `office`, and `safety` packs. It is installed through the Codex marketplace path described in [Codex installation](codex.md).

Each release also ships a portable Agent Plugins v1 package (`harness-agent-plugins-<version>.tgz`) for clients that implement the standard. It contains the same five skills as flat immediate children plus a root `plugin.json`, and is installed manually per the client's own procedure — this repository performs no managed generic-client installation. See [Agent Plugins installation](agent-plugins.md).

Other hosts use the generic/manual fallback. They receive no managed native package from this repository. Follow the host's own documentation and retain the same Trio authority, Host lifecycle boundary, and human gates.

The generic/manual fallback is guidance, not an installation claim or proof of a Host feature.
