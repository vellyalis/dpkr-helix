#requires -Version 5.1

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$recoveryPath = Join-Path $PSScriptRoot "setup-windows-recovery.ps1"
$sourceText = Get-Content -LiteralPath $recoveryPath -Raw
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $recoveryPath,
  [ref] $tokens,
  [ref] $parseErrors
)
if ($parseErrors.Count -gt 0) {
  throw "PowerShell parse failed: $($parseErrors[0].Message)"
}

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool] $Condition,
    [Parameter(Mandatory = $true)][string] $Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

function Get-RecoveryFunctionSource {
  param([string[]] $Names)
  $definitions = $ast.FindAll({
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
    }, $true)
  $selected = @()
  foreach ($name in $Names) {
    $definition = $definitions |
      Where-Object { $_.Name -eq $name } |
      Select-Object -First 1
    if (-not $definition) {
      throw "Recovery function was not found: $name"
    }
    $selected += $definition.Extent.Text
  }
  return $selected -join "`n`n"
}

. ([ScriptBlock]::Create(
    (Get-RecoveryFunctionSource -Names @(
        "Write-Utf8NoBom",
        "Read-Utf8Text",
        "Read-JsonFile",
        "Get-PropertyValue",
        "Normalize-StableOrigin",
        "Get-RecoverySettings",
        "Test-HttpEndpoint",
        "Invoke-ManagedStart",
        "Invoke-Recovery",
        "Get-HiddenLauncherContent",
        "Assert-ManagedFile",
        "Restore-ManagedFile",
        "Test-ManagedTask",
        "Install-Recovery",
        "Remove-Recovery"
      ))
  ))

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "dpkr-helix-recovery-test-" + [Guid]::NewGuid().ToString("N")
)
$script:ManagedMarker = "managed-by-dpkr-helix-windows-recovery"
$script:DevSpaceDir = Join-Path $temporaryRoot ".devspace"
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
$script:SourceRecoveryPath = [System.IO.Path]::GetFullPath($recoveryPath)

New-Item -ItemType Directory -Path $script:DevSpaceDir | Out-Null

try {
  Write-Utf8NoBom -Path $script:ManagedSetupPath -Content "# managed setup fixture`n"
  Write-Utf8NoBom -Path $script:SettingsPath -Content (
    '{"tunnelMode":"External","port":17676,"publicBaseUrl":"https://mcp.example.com"}'
  )

  $settings = Get-RecoverySettings
  Assert-True -Condition ($settings.Port -eq 17676) -Message "Recovery port did not load."
  Assert-True `
    -Condition ($settings.PublicBaseUrl -eq "https://mcp.example.com") `
    -Message "Recovery origin did not load."

  $quickSettings = '{"tunnelMode":"QuickTunnel","port":17676,"publicBaseUrl":"https://example.com"}'
  Write-Utf8NoBom -Path $script:SettingsPath -Content $quickSettings
  $quickRejected = $false
  try {
    Get-RecoverySettings | Out-Null
  }
  catch {
    $quickRejected = $_.Exception.Message.Contains("TunnelMode External")
  }
  Assert-True -Condition $quickRejected -Message "Quick Tunnel recovery was not rejected."
  Write-Utf8NoBom -Path $script:SettingsPath -Content (
    '{"tunnelMode":"External","port":17676,"publicBaseUrl":"https://mcp.example.com"}'
  )

  $launcher = Get-HiddenLauncherContent
  Assert-True `
    -Condition $launcher.Contains("shell.Run(command, 0, True)") `
    -Message "Hidden launcher does not use the no-window WSH execution contract."
  Assert-True `
    -Condition $launcher.Contains("%USERPROFILE%\.devspace\setup-windows-recovery.ps1") `
    -Message "Hidden launcher contains no portable user-profile path."
  Assert-True `
    -Condition (-not $launcher.Contains("C:\Users\")) `
    -Message "Hidden launcher contains a machine-specific user path."

  $script:startCount = 0
  function Invoke-ManagedStart {
    $script:startCount += 1
  }
  function Test-HttpEndpoint {
    param([string] $Uri)
    return $true
  }
  Invoke-Recovery
  Assert-True `
    -Condition ($script:startCount -eq 0) `
    -Message "Recovery restarted after an intentional Stop state."

  Write-Utf8NoBom -Path $script:RuntimeStatePath -Content '{"schema":"fixture"}'
  function Test-HttpEndpoint {
    param([string] $Uri)
    return $Uri.StartsWith("http://127.0.0.1:")
  }
  $publicOnlyRejected = $false
  try {
    Invoke-Recovery
  }
  catch {
    $publicOnlyRejected = $_.Exception.Message -match "(?i)public endpoint"
  }
  Assert-True `
    -Condition $publicOnlyRejected `
    -Message "Public-only failure did not report the external owner."
  Assert-True `
    -Condition ($script:startCount -eq 0) `
    -Message "Public-only failure restarted a healthy local DevSpace process."

  $script:healthAfterStart = $false
  function Test-HttpEndpoint {
    param([string] $Uri)
    return $script:healthAfterStart
  }
  function Invoke-ManagedStart {
    $script:startCount += 1
    $script:healthAfterStart = $true
  }
  Invoke-Recovery
  Assert-True `
    -Condition ($script:startCount -eq 1) `
    -Message "Local failure did not perform exactly one managed restart."

  $managedTask = [pscustomobject]@{
    TaskPath = $script:TaskPath
    Description = $script:TaskDescription
    Actions = @([pscustomobject]@{
        Execute = $script:WscriptPath
        Arguments = '//B //NoLogo "' + $script:HiddenLauncherPath + '"'
      })
    Principal = [pscustomobject]@{
      UserId = $script:TaskUserId
      LogonType = "Interactive"
      RunLevel = "Limited"
    }
  }
  Assert-True `
    -Condition (Test-ManagedTask -Task $managedTask) `
    -Message "Expected managed Scheduled Task action was not recognized."
  $spoofedTask = [pscustomobject]@{
    TaskPath = $script:TaskPath
    Description = "Another task using the same launcher"
    Actions = @([pscustomobject]@{
        Execute = $script:WscriptPath
        Arguments = '//B //NoLogo "' + $script:HiddenLauncherPath + '"'
      })
    Principal = [pscustomobject]@{
      UserId = $script:TaskUserId
      LogonType = "Interactive"
      RunLevel = "Limited"
    }
  }
  Assert-True `
    -Condition (-not (Test-ManagedTask -Task $spoofedTask)) `
    -Message "A matching Action without the ownership marker was accepted as managed."

  $script:registeredTask = $null
  $script:registeredTaskName = $null
  $script:unregisteredTaskName = $null
  function Get-ScheduledTask {
    param(
      [string] $TaskName,
      [string] $TaskPath,
      [System.Management.Automation.ActionPreference] $ErrorAction
    )
    return $script:registeredTask
  }
  function New-ScheduledTaskAction {
    param([string] $Execute, [string] $Argument)
    return [pscustomobject]@{
      Execute = $Execute
      Arguments = $Argument
    }
  }
  function New-ScheduledTaskTrigger {
    param(
      [switch] $Once,
      [switch] $AtLogOn,
      [DateTime] $At,
      [TimeSpan] $RepetitionInterval,
      [TimeSpan] $RepetitionDuration
    )
    return [pscustomobject]@{
      Once = $Once
      AtLogOn = $AtLogOn
      At = $At
      RepetitionInterval = $RepetitionInterval
      RepetitionDuration = $RepetitionDuration
    }
  }
  function New-ScheduledTaskPrincipal {
    param([string] $UserId, [string] $LogonType, [string] $RunLevel)
    return [pscustomobject]@{
      UserId = $UserId
      LogonType = $LogonType
      RunLevel = $RunLevel
    }
  }
  function New-ScheduledTaskSettingsSet {
    param(
      [switch] $AllowStartIfOnBatteries,
      [switch] $DontStopIfGoingOnBatteries,
      [switch] $StartWhenAvailable,
      [string] $MultipleInstances,
      [TimeSpan] $ExecutionTimeLimit
    )
    return [pscustomobject]@{
      MultipleInstances = $MultipleInstances
      ExecutionTimeLimit = $ExecutionTimeLimit
    }
  }
  function Register-ScheduledTask {
    param(
      [string] $TaskName,
      [string] $TaskPath,
      $Action,
      $Trigger,
      $Principal,
      $Settings,
      [string] $Description,
      [switch] $Force
    )
    if ($script:failRegistration) {
      throw "injected task registration failure"
    }
    $script:registeredTaskName = $TaskName
    $script:registeredTask = [pscustomobject]@{
      TaskPath = $TaskPath
      Description = $Description
      Actions = @($Action)
      Triggers = @($Trigger)
      Principal = $Principal
      Settings = $Settings
    }
    return $script:registeredTask
  }
  function Unregister-ScheduledTask {
    param([string] $TaskName, [string] $TaskPath, [switch] $Confirm)
    $script:unregisteredTaskName = $TaskName
    $script:unregisteredTaskPath = $TaskPath
    $script:registeredTask = $null
  }

  $script:failRegistration = $true
  $registrationRejected = $false
  $registrationError = $null
  try {
    Install-Recovery
  }
  catch {
    $registrationError = $_.Exception.Message
    $registrationRejected = $_.Exception.Message.Contains("injected task registration failure")
  }
  Assert-True `
    -Condition $registrationRejected `
    -Message "Injected task registration failure was not surfaced: $registrationError"
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:ManagedRecoveryPath)) `
    -Message "Failed task registration left the managed recovery script."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:HiddenLauncherPath)) `
    -Message "Failed task registration left the managed hidden launcher."
  $script:failRegistration = $false

  Install-Recovery
  Assert-True `
    -Condition ($script:registeredTaskName -eq "dpkr helix Recovery") `
    -Message "Recovery registered an unexpected task name."
  Assert-True `
    -Condition ($script:registeredTask.TaskPath -eq "\") `
    -Message "Recovery registered an unexpected task path."
  Assert-True `
    -Condition (Test-ManagedTask -Task $script:registeredTask) `
    -Message "Recovery registered an unexpected task Action."
  Assert-True `
    -Condition (@($script:registeredTask.Triggers).Count -eq 2) `
    -Message "Recovery did not register both accepted triggers."
  Assert-True `
    -Condition ((Read-Utf8Text -Path $script:ManagedRecoveryPath).Contains($script:ManagedMarker)) `
    -Message "Managed recovery copy lost its ownership marker."
  Assert-True `
    -Condition ((Read-Utf8Text -Path $script:HiddenLauncherPath).Contains("shell.Run(command, 0, True)")) `
    -Message "Installed launcher lost the no-window WSH contract."

  Remove-Recovery
  Assert-True `
    -Condition ($script:unregisteredTaskName -eq "dpkr helix Recovery") `
    -Message "Recovery rollback did not remove the exact managed task."
  Assert-True `
    -Condition ($script:unregisteredTaskPath -eq "\") `
    -Message "Recovery rollback did not target the exact managed task path."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:ManagedRecoveryPath)) `
    -Message "Recovery rollback left the managed script."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:HiddenLauncherPath)) `
    -Message "Recovery rollback left the hidden launcher."

  Assert-True `
    -Condition ($sourceText.Contains('New-ScheduledTaskAction `')) `
    -Message "Recovery script does not define a Scheduled Task action."
  Assert-True `
    -Condition ($sourceText.Contains('$script:WscriptPath')) `
    -Message "Recovery task action does not use wscript.exe."
  Assert-True `
    -Condition ($sourceText.Contains("RepetitionInterval (New-TimeSpan -Minutes 5)")) `
    -Message "Recovery task does not define the accepted five-minute interval."
  Assert-True `
    -Condition ($sourceText.Contains("New-ScheduledTaskTrigger -AtLogOn")) `
    -Message "Recovery task does not define the accepted logon trigger."

  $originalUserProfile = $env:USERPROFILE
  $planProfile = Join-Path $temporaryRoot "plan-user"
  New-Item -ItemType Directory -Path $planProfile | Out-Null
  try {
    $env:USERPROFILE = $planProfile
    $planOutput = & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $recoveryPath `
      -Mode Plan 2>&1 | Out-String
    $planExitCode = $LASTEXITCODE
  }
  finally {
    $env:USERPROFILE = $originalUserProfile
  }
  Assert-True -Condition ($planExitCode -eq 0) -Message "Recovery Plan failed: $planOutput"
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath (Join-Path $planProfile ".devspace"))) `
    -Message "Recovery Plan created managed DevSpace files."
  Assert-True -Condition $planOutput.Contains("PublicOutageRule") -Message "Recovery Plan omitted outage behavior."
  Assert-True -Condition $planOutput.Contains("no Owner password") -Message "Recovery Plan omitted secret policy."
}
finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

Write-Host "setup-windows recovery tests: pass"
