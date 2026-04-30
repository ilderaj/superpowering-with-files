# Initialize planning files for the active task.
# Usage: .\init-session.ps1 [project-path] [task-id]

param(
    [string]$ProjectPath = (Get-Location).Path,
    [string]$TaskId = ""
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Timestamp = ([DateTimeOffset]::UtcNow.ToOffset([TimeSpan]::FromHours(8))).ToString("yyyy-MM-dd HH:mm:ss") + " UTC+8"
$PythonCmd = Get-Command python -ErrorAction SilentlyContinue
if (-not $PythonCmd) {
    $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
}

if (-not $PythonCmd) {
    Write-Host '[planning-with-files] Python is required to initialize planning files.'
    exit 1
}

$PlanDir = & $PythonCmd.Source "$ScriptDir/planning_paths.py" ensure-active-dir $ProjectPath $TaskId
$TaskSlug = & $PythonCmd.Source "$ScriptDir/planning_paths.py" task-id $ProjectPath $TaskId

Write-Host ("Initializing planning files for task: " + $TaskSlug)
Write-Host ("Active planning dir: " + $PlanDir)

if (-not (Test-Path "$PlanDir/task_plan.md")) {
    Copy-Item "$ScriptDir/../templates/task_plan.md" "$PlanDir/task_plan.md"
    @"

## Task Metadata
- Task ID: $TaskSlug
- Planning Directory: $PlanDir
"@ | Add-Content "$PlanDir/task_plan.md"
    Write-Host ("Created " + $PlanDir + "/task_plan.md")
} else {
    Write-Host ($PlanDir + "/task_plan.md already exists, skipping")
}

if (-not (Test-Path "$PlanDir/findings.md")) {
    Copy-Item "$ScriptDir/../templates/findings.md" "$PlanDir/findings.md"
    @"

## Task Metadata
- Task ID: $TaskSlug
- Planning Directory: $PlanDir
"@ | Add-Content "$PlanDir/findings.md"
    Write-Host ("Created " + $PlanDir + "/findings.md")
} else {
    Write-Host ($PlanDir + "/findings.md already exists, skipping")
}

if (-not (Test-Path "$PlanDir/progress.md")) {
    (Get-Content "$ScriptDir/../templates/progress.md" -Raw).Replace("[TIMESTAMP]", $Timestamp).Replace("[DATE]", $Timestamp) | Out-File -FilePath "$PlanDir/progress.md" -Encoding UTF8
    @"

## Task Metadata
- Task ID: $TaskSlug
- Planning Directory: $PlanDir
"@ | Add-Content "$PlanDir/progress.md"
    Write-Host ("Created " + $PlanDir + "/progress.md")
} else {
    Write-Host ($PlanDir + "/progress.md already exists, skipping")
}

Write-Host ""
Write-Host "Planning files initialized!"
Write-Host ("Files: " + $PlanDir + "/task_plan.md, " + $PlanDir + "/findings.md, " + $PlanDir + "/progress.md")
