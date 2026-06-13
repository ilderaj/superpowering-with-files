# Initialize planning files for the active task, or delegate to the canonical
# slug/v3 initializer when the caller is using the shipped skill entrypoint.

param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ArgsList
)

function Test-LooksLikeProjectPath([string]$Candidate) {
    if ([string]::IsNullOrWhiteSpace($Candidate)) { return $false }
    if ($Candidate.StartsWith("-")) { return $false }
    if (Test-Path $Candidate -PathType Container) { return $true }
    return $Candidate -match '^(?:[A-Za-z]:[\\/]|[\\/]{1,2}|\.{1,2}[\\/]|~[\\/])'
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$CanonicalInit = Join-Path $ScriptDir "../skills/planning-with-files/scripts/init-session.ps1"

if ($ArgsList.Count -eq 2 -and (Test-LooksLikeProjectPath $ArgsList[0]) -and -not $ArgsList[1].StartsWith("-")) {
    $ProjectPath = $ArgsList[0]
    $TaskId = $ArgsList[1]
    $PythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if (-not $PythonCmd) {
        $PythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
    }

    if (-not $PythonCmd) {
        Write-Host '[planning-with-files] Python is required to initialize planning files.'
        exit 1
    }

    $Timestamp = & $PythonCmd.Source "$ScriptDir/planning_record.py" timestamp

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
    exit 0
}

if (-not (Test-Path $CanonicalInit)) {
    Write-Host ("[planning-with-files] Canonical init-session.ps1 missing at " + $CanonicalInit)
    exit 1
}

& $CanonicalInit @ArgsList
exit $LASTEXITCODE
