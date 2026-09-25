# Mark the active planning directory for the current task as closed.

param(
    [string]$ProjectPath = (Get-Location).Path,
    [string]$TaskId = "",
    [string]$Reason = "Task completed and verified."
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}

if (-not $PythonCmd) {
    Write-Host '[planning-with-files] Python is required to close planning tasks.'
    exit 1
}

& $PythonCmd.Source "$ScriptDir/close-task.py" $ProjectPath $TaskId --reason $Reason
