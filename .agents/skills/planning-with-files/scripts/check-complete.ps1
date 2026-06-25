# Report completion and archive eligibility for the active task.
# Always exits 0 because incomplete tasks are a normal state.

param(
    [string]$PlanFile = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}

if (-not $PythonCmd) {
    Write-Host '[planning-with-files] Python is required to check planning task status.'
    exit 0
}

if ($PlanFile) {
    if (-not (Test-Path $PlanFile)) {
        Write-Host '[planning-with-files] No task_plan.md found -- no active planning session.'
        exit 0
    }

    $Code = @"
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from task_lifecycle import format_summary, inspect_plan_dir
print(format_summary(inspect_plan_dir(Path(sys.argv[1]).resolve().parent)))
"@
    & $PythonCmd.Source -c $Code $PlanFile $ScriptDir
    exit 0
}

& $PythonCmd.Source "$ScriptDir/task-status.py" (Get-Location).Path
exit 0
