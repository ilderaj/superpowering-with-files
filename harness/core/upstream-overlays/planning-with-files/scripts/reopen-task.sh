#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 "$SCRIPT_DIR/reopen-task.py" "${1:-$(pwd)}" "${2:?exact archive or closed active task path required}"
