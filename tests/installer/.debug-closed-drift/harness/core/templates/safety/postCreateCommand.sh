#!/usr/bin/env bash
set -euo pipefail

./scripts/harness install --scope=workspace --profile=cloud-safe --deployment-profile=github-cloud --hooks=on
