# Archive the active planning directory for the current task.

param(
    [string]$ProjectPath = (Get-Location).Path,
    [string]$TaskId = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}

if (-not $PythonCmd) {
    Write-Host '[planning-with-files] Python is required to archive planning files.'
    exit 1
}

& $PythonCmd.Source "$ScriptDir/task-status.py" $ProjectPath $TaskId --require-safe-to-archive
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$ArchiveDir = & $PythonCmd.Source "$ScriptDir/planning_paths.py" archive-active $ProjectPath $TaskId
Write-Host ('[planning-with-files] Archived active planning files to: ' + $ArchiveDir)
