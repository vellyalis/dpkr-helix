#requires -Version 5.1

<#
.SYNOPSIS
Installs, removes, previews, or runs optional no-console dpkr helix recovery.

.DESCRIPTION
The recovery task is available only for a portable Windows installation using
TunnelMode External with a stable HTTPS origin. It checks the installer-owned
runtime record and local/public health, then calls the managed
setup-windows.ps1 Start mode only when the local service is unhealthy.

Install and Remove change the current user's Task Scheduler state and must be
run only after explicit user approval. Run is intended for the managed
wscript.exe no-console entry.
#>

[CmdletBinding()]
param(
  [ValidateSet("Plan", "Install", "Remove", "Run")]
  [string] $Mode = "Plan"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$script:ManagedMarker = "managed-by-dpkr-helix-windows-recovery"
$script:DevSpaceDir = Join-Path $env:USERPROFILE ".devspace"
$script:SettingsPath = Join-Path $script:DevSpaceDir "windows-bootstrap.json"
$script:RuntimeStatePath = Join-Path $script:DevSpaceDir "windows-runtime.json"
$script:ManagedSetupPath = Join-Path $script:DevSpaceDir "setup-windows.ps1"
$script:ManagedRecoveryPath = Join-Path $script:DevSpaceDir "setup-windows-recovery.ps1"
$script:HiddenLauncherPath = Join-Path $script:DevSpaceDir "start-windows-recovery-hidden.vbs"
$script:TaskName = "dpkr helix Recovery"
$script:TaskPath = "\"
$script:TaskDescription = "$($script:ManagedMarker): Health-gated no-console recovery for the current user's dpkr helix installation."
$script:TaskUserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$script:WscriptPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$script:SourceRecoveryPath = [System.IO.Path]::GetFullPath($PSCommandPath)
$script:RuntimeMutexName = "Local\dpkr-helix-windows-runtime"

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string] $Content
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Read-Utf8Text {
  param([Parameter(Mandatory = $true)][string] $Path)
  $encoding = New-Object System.Text.UTF8Encoding($false, $true)
  return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }
  return Read-Utf8Text -Path $Path | ConvertFrom-Json
}

function Get-PropertyValue {
  param(
    [Parameter(Mandatory = $true)] $InputObject,
    [Parameter(Mandatory = $true)][string] $Name
  )
  $property = $InputObject.PSObject.Properties[$Name]
  if ($property) {
    return $property.Value
  }
  return $null
}

function Normalize-StableOrigin {
  param([Parameter(Mandatory = $true)][string] $Value)
  try {
    $uri = New-Object System.Uri($Value)
  }
  catch {
    throw "Saved PublicBaseUrl is not a valid absolute HTTPS origin."
  }
  if (
    -not $uri.IsAbsoluteUri -or
    $uri.Scheme -ne "https" -or
    -not $uri.Host -or
    $uri.Query -or
    $uri.Fragment -or
    $uri.AbsolutePath -ne "/"
  ) {
    throw "Saved PublicBaseUrl must be an HTTPS origin without a path, query, or fragment."
  }
  if ($uri.Host -eq "pending.invalid") {
    throw "Saved PublicBaseUrl is still the temporary pending.invalid value."
  }
  return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd("/")
}

function Get-RecoverySettings {
  $settings = Read-JsonFile -Path $script:SettingsPath
  if (-not $settings) {
    throw "Portable setup settings are missing. Run setup-windows.ps1 in Install mode first."
  }
  $tunnelMode = [string](Get-PropertyValue -InputObject $settings -Name "tunnelMode")
  if ($tunnelMode -ne "External") {
    throw "Scheduled recovery requires TunnelMode External with a stable HTTPS origin."
  }
  $port = [int](Get-PropertyValue -InputObject $settings -Name "port")
  if ($port -lt 1 -or $port -gt 65535) {
    throw "Saved DevSpace port is invalid."
  }
  $origin = Normalize-StableOrigin -Value (
    [string](Get-PropertyValue -InputObject $settings -Name "publicBaseUrl")
  )
  if (-not (Test-Path -LiteralPath $script:ManagedSetupPath -PathType Leaf)) {
    throw "Managed DevSpace setup is missing: $script:ManagedSetupPath"
  }
  $desiredState = [string](Get-PropertyValue -InputObject $settings -Name "desiredState")
  if (-not $desiredState) {
    $desiredState = if (Test-Path -LiteralPath $script:RuntimeStatePath -PathType Leaf) {
      "running"
    } else { "stopped" }
  }
  if ($desiredState -notin @("running", "stopped")) {
    throw "Saved desiredState must be running or stopped."
  }
  return [pscustomobject]@{
    Port = $port
    PublicBaseUrl = $origin
    DesiredState = $desiredState
  }
}

function Test-HttpEndpoint {
  param(
    [Parameter(Mandatory = $true)][string] $Uri,
    [int] $TimeoutSeconds = 10
  )
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri $Uri `
      -Headers @{
        Accept = "application/json"
        "User-Agent" = "dpkr-helix-windows-recovery/1.0"
      } `
      -TimeoutSec $TimeoutSeconds
    return [int]$response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Test-RuntimeOperationInProgress {
  $mutex = New-Object System.Threading.Mutex($false, $script:RuntimeMutexName)
  $acquired = $false
  try {
    try {
      $acquired = $mutex.WaitOne(0)
    }
    catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    return -not $acquired
  }
  finally {
    if ($acquired) {
      $mutex.ReleaseMutex()
    }
    $mutex.Dispose()
  }
}

function Invoke-ManagedStart {
  $powershell = (Get-Command "powershell.exe" -ErrorAction Stop).Source
  $quotedSetupPath = '"' + $script:ManagedSetupPath.Replace('"', '\"') + '"'
  $process = Start-Process `
    -FilePath $powershell `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-WindowStyle", "Hidden",
      "-File", $quotedSetupPath,
      "-Mode", "Start",
      "-RecoveryStart",
      "-SkipVerification",
      "-SkipBrowserLaunch"
    ) `
    -WindowStyle Hidden `
    -PassThru
  $process.WaitForExit()
  if ($process.ExitCode -ne 0) {
    throw "Managed DevSpace restart failed with exit code $($process.ExitCode)."
  }
}

function Invoke-Recovery {
  $settings = Get-RecoverySettings
  if ($settings.DesiredState -ne "running") {
    Write-Host "Recovery skipped: DevSpace was intentionally stopped."
    return
  }
  if (Test-RuntimeOperationInProgress) {
    Write-Host "Recovery skipped: another managed start, stop, or install is active."
    return
  }

  $localHealth = "http://127.0.0.1:$($settings.Port)/healthz"
  $publicHealth = "$($settings.PublicBaseUrl)/healthz"
  $localHealthy = Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3
  if (-not $localHealthy) {
    Start-Sleep -Seconds 1
    $localHealthy = Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3
  }
  if ($localHealthy) {
    if (Test-HttpEndpoint -Uri $publicHealth) {
      Write-Host "Recovery check: local and public health pass."
      return
    }
    throw "Public endpoint is unhealthy while local DevSpace is healthy; preserve the local process and recover the external tunnel owner."
  }

  Invoke-ManagedStart
  if (
    -not (Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3) -or
    -not (Test-HttpEndpoint -Uri $publicHealth)
  ) {
    throw "DevSpace health did not recover on both local and public endpoints."
  }
  Write-Host "Recovery check: DevSpace restarted and local/public health pass."
}

function Get-HiddenLauncherContent {
  return @'
' managed-by-dpkr-helix-windows-recovery
Option Explicit

Dim shell
Dim scriptPath
Dim command
Dim exitCode

Set shell = CreateObject("WScript.Shell")
scriptPath = shell.ExpandEnvironmentStrings("%USERPROFILE%\.devspace\setup-windows-recovery.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & scriptPath & """ -Mode Run"

exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
'@
}

function Assert-ManagedFile {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (
    (Test-Path -LiteralPath $Path -PathType Leaf) -and
    -not (Read-Utf8Text -Path $Path).Contains($script:ManagedMarker)
  ) {
    throw "Refusing to replace an unmanaged file: $Path"
  }
}

function Restore-ManagedFile {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][bool] $HadPrevious,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string] $PreviousContent
  )
  if ($HadPrevious) {
    Write-Utf8NoBom -Path $Path -Content $PreviousContent
    return
  }
  if (Test-Path -LiteralPath $Path -PathType Leaf) {
    Assert-ManagedFile -Path $Path
    Remove-Item -LiteralPath $Path -Force
  }
}

function Test-ManagedTask {
  param([Parameter(Mandatory = $true)] $Task)
  $actions = @(Get-PropertyValue -InputObject $Task -Name "Actions")
  $principal = Get-PropertyValue -InputObject $Task -Name "Principal"
  if ($actions.Count -ne 1 -or -not $principal) {
    return $false
  }
  $action = $actions[0]
  $expectedArguments = '//B //NoLogo "' + $script:HiddenLauncherPath + '"'
  return (
    [string]::Equals(
      [string](Get-PropertyValue -InputObject $Task -Name "TaskPath"),
      $script:TaskPath,
      [System.StringComparison]::Ordinal
    ) -and [string]::Equals(
      [string](Get-PropertyValue -InputObject $Task -Name "Description"),
      $script:TaskDescription,
      [System.StringComparison]::Ordinal
    ) -and [string]::Equals(
      [string](Get-PropertyValue -InputObject $principal -Name "UserId"),
      $script:TaskUserId,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and [string]::Equals(
      [string](Get-PropertyValue -InputObject $principal -Name "LogonType"),
      "Interactive",
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and [string]::Equals(
      [string](Get-PropertyValue -InputObject $principal -Name "RunLevel"),
      "Limited",
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and [string]::Equals(
      [string]$action.Execute,
      $script:WscriptPath,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -and [string]::Equals(
      [string]$action.Arguments,
      $expectedArguments,
      [System.StringComparison]::Ordinal
    )
  )
}

function Install-Recovery {
  Get-RecoverySettings | Out-Null
  Assert-ManagedFile -Path $script:ManagedRecoveryPath
  Assert-ManagedFile -Path $script:HiddenLauncherPath
  $hadPreviousRecovery = Test-Path -LiteralPath $script:ManagedRecoveryPath -PathType Leaf
  $previousRecovery = if ($hadPreviousRecovery) {
    Read-Utf8Text -Path $script:ManagedRecoveryPath
  } else { "" }
  $hadPreviousLauncher = Test-Path -LiteralPath $script:HiddenLauncherPath -PathType Leaf
  $previousLauncher = if ($hadPreviousLauncher) {
    Read-Utf8Text -Path $script:HiddenLauncherPath
  } else { "" }

  $existingTask = Get-ScheduledTask `
    -TaskName $script:TaskName `
    -TaskPath $script:TaskPath `
    -ErrorAction SilentlyContinue
  if ($existingTask -and -not (Test-ManagedTask -Task $existingTask)) {
    throw "Refusing to replace an unmanaged Scheduled Task named '$($script:TaskName)'."
  }

  $createdTask = -not $existingTask
  try {
    if (-not (Test-Path -LiteralPath $script:DevSpaceDir -PathType Container)) {
      New-Item -ItemType Directory -Path $script:DevSpaceDir -Force | Out-Null
    }
    $sourcePath = $script:SourceRecoveryPath
    $destinationPath = [System.IO.Path]::GetFullPath($script:ManagedRecoveryPath)
    if (
      -not [string]::Equals(
        $sourcePath,
        $destinationPath,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Force
    }
    Write-Utf8NoBom `
      -Path $script:HiddenLauncherPath `
      -Content ((Get-HiddenLauncherContent).Trim() + "`r`n")

    $action = New-ScheduledTaskAction `
      -Execute $script:WscriptPath `
      -Argument ('//B //NoLogo "' + $script:HiddenLauncherPath + '"')
    $repeatTrigger = New-ScheduledTaskTrigger `
      -Once `
      -At ([DateTime]::Now.AddMinutes(1)) `
      -RepetitionInterval (New-TimeSpan -Minutes 5) `
      -RepetitionDuration (New-TimeSpan -Days 3650)
    $logonTrigger = New-ScheduledTaskTrigger -AtLogOn
    $principal = New-ScheduledTaskPrincipal `
      -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
      -LogonType Interactive `
      -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -StartWhenAvailable `
      -MultipleInstances IgnoreNew `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
    Register-ScheduledTask `
      -TaskName $script:TaskName `
      -TaskPath $script:TaskPath `
      -Action $action `
      -Trigger @($repeatTrigger, $logonTrigger) `
      -Principal $principal `
      -Settings $settings `
      -Description $script:TaskDescription `
      -Force | Out-Null

    $installed = Get-ScheduledTask `
      -TaskName $script:TaskName `
      -TaskPath $script:TaskPath `
      -ErrorAction Stop
    if (-not (Test-ManagedTask -Task $installed)) {
      throw "The recovery task was registered with an unexpected action."
    }
  }
  catch {
    if ($createdTask) {
      $installed = Get-ScheduledTask `
        -TaskName $script:TaskName `
        -TaskPath $script:TaskPath `
        -ErrorAction SilentlyContinue
      if ($installed -and (Test-ManagedTask -Task $installed)) {
        Unregister-ScheduledTask `
          -TaskName $script:TaskName `
          -TaskPath $script:TaskPath `
          -Confirm:$false
      }
    }
    Restore-ManagedFile `
      -Path $script:HiddenLauncherPath `
      -HadPrevious $hadPreviousLauncher `
      -PreviousContent $previousLauncher
    Restore-ManagedFile `
      -Path $script:ManagedRecoveryPath `
      -HadPrevious $hadPreviousRecovery `
      -PreviousContent $previousRecovery
    throw
  }
  Write-Host "Installed Scheduled Task: $($script:TaskName)"
}

function Remove-Recovery {
  $existingTask = Get-ScheduledTask `
    -TaskName $script:TaskName `
    -TaskPath $script:TaskPath `
    -ErrorAction SilentlyContinue
  if ($existingTask) {
    if (-not (Test-ManagedTask -Task $existingTask)) {
      throw "Refusing to remove an unmanaged Scheduled Task named '$($script:TaskName)'."
    }
    Unregister-ScheduledTask `
      -TaskName $script:TaskName `
      -TaskPath $script:TaskPath `
      -Confirm:$false
  }
  foreach ($path in @($script:HiddenLauncherPath, $script:ManagedRecoveryPath)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      Assert-ManagedFile -Path $path
      Remove-Item -LiteralPath $path -Force
    }
  }
  Write-Host "Removed managed dpkr helix recovery."
}

function Show-Plan {
  $eligibility = "not installed"
  try {
    $settings = Get-RecoverySettings
    $eligibility = "eligible: External $($settings.PublicBaseUrl)"
  }
  catch {
    $eligibility = "blocked: $($_.Exception.Message)"
  }
  [pscustomobject]@{
    Mode = "Plan"
    Eligibility = $eligibility
    TaskName = $script:TaskName
    Action = "$script:WscriptPath //B //NoLogo `"$script:HiddenLauncherPath`""
    Triggers = "current-user logon and every five minutes"
    Writes = "$script:ManagedRecoveryPath; $script:HiddenLauncherPath; current-user Scheduled Task"
    RestartRule = "restart only when a managed runtime record exists and local health is bad"
    PublicOutageRule = "never restart a healthy local process for a public-only outage"
    Secrets = "no Owner password, Cloudflare token, credential file, cookie, or browser profile is read"
    Rollback = "& `"$script:ManagedRecoveryPath`" -Mode Remove"
  } | Format-List
}

switch ($Mode) {
  "Plan" {
    Show-Plan
  }
  "Install" {
    Install-Recovery
  }
  "Remove" {
    Remove-Recovery
  }
  "Run" {
    Invoke-Recovery
  }
}
