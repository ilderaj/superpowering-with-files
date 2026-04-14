: << 'CMDBLOCK'
@echo off
REM Codex disables hooks on Windows, so this wrapper exits quietly there.
exit /b 0
CMDBLOCK

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"
shift
exec sh "${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
