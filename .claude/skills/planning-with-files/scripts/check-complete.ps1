# Report completion and lifecycle readiness for the active planning task.
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

if (-not $PlanFile) {
    $PlanDir = ""
    $Resolver = Join-Path $ScriptDir "resolve-plan-dir.ps1"
    if (Test-Path $Resolver) {
        $ResolvedPlanDir = & $Resolver 2>$null
        if ($ResolvedPlanDir) {
            $PlanDir = ($ResolvedPlanDir | Select-Object -First 1).Trim()
        }
    }

    if (-not $PlanDir) {
        $ResolvedPlanDir = & $PythonCmd.Source "$ScriptDir/planning_paths.py" active-dir (Get-Location).Path 2>$null
        if ($ResolvedPlanDir) {
            $PlanDir = ($ResolvedPlanDir | Select-Object -First 1).Trim()
        }
    }

    if ($PlanDir) {
        $Candidate = Join-Path $PlanDir "task_plan.md"
        if (Test-Path $Candidate) {
            $PlanFile = $Candidate
        }
    }

    if ((-not $PlanFile) -and (Test-Path "task_plan.md")) {
        $PlanFile = "task_plan.md"
    }
}

if (-not $PlanFile -or -not (Test-Path $PlanFile)) {
    Write-Host '[planning-with-files] No task_plan.md found -- no active planning session.'
    exit 0
}

$Code = @"
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[2])
from task_lifecycle import format_summary, inspect_plan_dir
plan_file = Path(sys.argv[1]).resolve()
status = inspect_plan_dir(plan_file.parent)
if status.get("safe_to_archive") and status.get("looks_complete"):
    print(
        "[planning-with-files] ALL PHASES COMPLETE "
        f"({status['phase_complete']}/{status['phase_total']}). "
        "If the user has additional work, add new phases to task_plan.md before starting."
    )
else:
    print(format_summary(status))
"@
& $PythonCmd.Source -c $Code $PlanFile $ScriptDir
exit 0
