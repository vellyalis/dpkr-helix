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
        "Write-JsonAtomic",
        "Read-Utf8Text",
        "Read-JsonFile",
        "Get-PropertyValue",
        "Normalize-StableOrigin",
        "Get-RecoverySettings",
        "Test-HttpEndpoint",
        "Get-UriOrigin",
        "Assert-UriUsesOrigin",
        "Test-OAuthMetadata",
        "Write-RecoveryStatus",
        "Throw-RecoveryFailure",
        "Get-RecoveryFailureCode",
        "Get-RecoveryStatusMessage",
        "Get-RuntimeIdentityStamp",
        "Test-RuntimeOperationInProgress",
        "Invoke-ManagedStart",
        "Invoke-Recovery",
        "Get-HiddenLauncherContent",
        "Assert-ManagedFile",
        "Restore-ManagedFile",
        "Get-TaskUserSid",
        "Test-ScheduledTaskAccessDenied",
        "Get-RecoveryTaskFullName",
        "Invoke-SchtasksChecked",
        "Register-RecoveryTaskWithSchtasks",
        "Remove-RecoveryTaskWithSchtasks",
        "Test-ManagedTask",
        "Remove-ManagedRecoveryTask",
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
$script:RecoveryStatusPath = Join-Path $script:DevSpaceDir "windows-recovery.json"
$script:ManagedSetupPath = Join-Path $script:DevSpaceDir "setup-windows.ps1"
$script:ManagedRecoveryPath = Join-Path $script:DevSpaceDir "setup-windows-recovery.ps1"
$script:HiddenLauncherPath = Join-Path $script:DevSpaceDir "start-windows-recovery-hidden.vbs"
$script:TaskName = "dpkr helix Recovery"
$script:TaskPath = "\"
$script:TaskDescription = "$($script:ManagedMarker): Health-gated no-console recovery for the current user's dpkr helix installation."
$script:TaskUserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$script:WscriptPath = Join-Path $env:SystemRoot "System32\wscript.exe"
$script:SchtasksPath = Join-Path $env:SystemRoot "System32\schtasks.exe"
$script:SourceRecoveryPath = [System.IO.Path]::GetFullPath($recoveryPath)
$script:RuntimeMutexName = "Local\dpkr-helix-recovery-test-" + [Guid]::NewGuid().ToString("N")

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
  Assert-True -Condition ($settings.DesiredState -eq "stopped") -Message "Missing runtime was not treated as stopped."

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

  $managedStartSource = Get-RecoveryFunctionSource -Names @("Invoke-ManagedStart")
  Assert-True `
    -Condition (
      $managedStartSource.Contains('$process.WaitForExit(120000)') -and
      $managedStartSource -notmatch '(?m)^\s*-Wait'
    ) `
    -Message "Recovery wrapper wait is not bounded independently from the descendant server."

  $script:recoveryOAuthStale = $false
  function Invoke-WebRequest {
    param(
      [switch] $UseBasicParsing,
      [string] $Uri,
      [hashtable] $Headers,
      [int] $TimeoutSec
    )
    $advertisedOrigin = if ($script:recoveryOAuthStale) {
      "https://obsolete.trycloudflare.com"
    }
    else {
      "https://mcp.example.com"
    }
    if ($Uri.Contains("oauth-protected-resource")) {
      return [pscustomobject]@{
        StatusCode = 200
        Content = (@{
            resource = "$advertisedOrigin/mcp"
            authorization_servers = @("$advertisedOrigin/")
          } | ConvertTo-Json -Compress)
      }
    }
    return [pscustomobject]@{
      StatusCode = 200
      Content = (@{
          issuer = "$advertisedOrigin/"
          authorization_endpoint = "$advertisedOrigin/authorize"
          token_endpoint = "$advertisedOrigin/token"
          registration_endpoint = "$advertisedOrigin/register"
        } | ConvertTo-Json -Compress)
    }
  }
  try {
    Test-OAuthMetadata `
      -Origin "http://127.0.0.1:17676" `
      -ExpectedPublicOrigin "https://mcp.example.com" `
      -TimeoutSeconds 3
    $script:recoveryOAuthStale = $true
    $recoveryStaleOAuthRejected = $false
    try {
      Test-OAuthMetadata `
        -Origin "http://127.0.0.1:17676" `
        -ExpectedPublicOrigin "https://mcp.example.com" `
        -TimeoutSeconds 3
    }
    catch {
      $recoveryStaleOAuthRejected = $_.Exception.Message.Contains("obsolete.trycloudflare.com")
    }
    Assert-True `
      -Condition $recoveryStaleOAuthRejected `
      -Message "Recovery accepted OAuth metadata from an obsolete Quick Tunnel origin."
  }
  finally {
    Remove-Item function:Invoke-WebRequest -ErrorAction SilentlyContinue
  }

  $script:startCount = 0
  $script:identityStamp = "stable-runtime"
  function Invoke-ManagedStart {
    $script:startCount += 1
  }
  function Get-RuntimeIdentityStamp {
    return $script:identityStamp
  }
  function Test-HttpEndpoint {
    param([string] $Uri, [int] $TimeoutSeconds)
    return $true
  }
  function Test-OAuthMetadata {
    param([string] $Origin, [string] $ExpectedPublicOrigin, [int] $TimeoutSeconds)
  }
  $intentionalStopResult = Invoke-Recovery
  Assert-True `
    -Condition ($script:startCount -eq 0) `
    -Message "Recovery restarted after an intentional Stop state."
  Assert-True `
    -Condition ($intentionalStopResult.Code -eq "INTENTIONALLY_STOPPED") `
    -Message "Intentional Stop did not return a diagnostic result."

  Write-Utf8NoBom -Path $script:SettingsPath -Content (
    '{"tunnelMode":"External","port":17676,"publicBaseUrl":"https://mcp.example.com","desiredState":"running"}'
  )
  function Test-RuntimeOperationInProgress { return $true }
  $operationResult = Invoke-Recovery
  Assert-True -Condition ($script:startCount -eq 0) -Message "Recovery raced an active managed operation."
  Assert-True `
    -Condition ($operationResult.Code -eq "OPERATION_IN_PROGRESS") `
    -Message "Active operation skip did not return a diagnostic result."
  function Test-RuntimeOperationInProgress { return $false }
  $script:healthAfterStart = $false
  $script:unhealthyLocalProbeCount = 0
  $script:identityStamp = $null
  function Test-HttpEndpoint {
    param([string] $Uri, [int] $TimeoutSeconds)
    if (-not $script:healthAfterStart) { $script:unhealthyLocalProbeCount += 1 }
    return $script:healthAfterStart
  }
  function Invoke-ManagedStart {
    $script:startCount += 1
    $script:healthAfterStart = $true
    $script:identityStamp = "recovered-runtime"
  }
  $recoveredResult = Invoke-Recovery
  Assert-True -Condition ($script:startCount -eq 1) -Message "Desired running state did not recover without a runtime record."
  Assert-True -Condition ($script:unhealthyLocalProbeCount -eq 2) -Message "Local failure was not confirmed before restart."
  Assert-True `
    -Condition ($recoveredResult.Code -eq "RUNTIME_RECOVERED") `
    -Message "A changed runtime identity was not reported as recovered."
  $script:startCount = 0

  $script:identityStamp = "stable-runtime"
  function Invoke-ManagedStart {
    $script:startCount += 1
  }
  function Test-HttpEndpoint {
    param([string] $Uri, [int] $TimeoutSeconds)
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
    -Condition ($script:startCount -eq 1) `
    -Message "Public-only failure skipped the managed local attestation gate."
  Assert-True `
    -Condition ($script:identityStamp -eq "stable-runtime") `
    -Message "Public-only failure changed the healthy local runtime identity."

  $script:startCount = 0
  $script:healthAfterStart = $false
  $script:identityStamp = "old-runtime"
  function Test-HttpEndpoint {
    param([string] $Uri, [int] $TimeoutSeconds)
    return $script:healthAfterStart
  }
  function Invoke-ManagedStart {
    $script:startCount += 1
    $script:healthAfterStart = $true
    $script:identityStamp = "new-runtime"
  }
  $secondRecoveryResult = Invoke-Recovery
  Assert-True `
    -Condition ($script:startCount -eq 1) `
    -Message "Local failure did not perform exactly one managed restart."
  Assert-True `
    -Condition ($secondRecoveryResult.State -eq "recovered") `
    -Message "Recovered runtime was not classified correctly."

  Write-RecoveryStatus `
    -State "recovered" `
    -Code "RUNTIME_RECOVERED" `
    -Message "fixture recovery"
  $persistedRecovery = Read-JsonFile -Path $script:RecoveryStatusPath
  Assert-True `
    -Condition ($persistedRecovery.schema -eq "dpkr-helix-windows-recovery/v1") `
    -Message "Recovery status schema was not persisted."
  Assert-True `
    -Condition ($persistedRecovery.code -eq "RUNTIME_RECOVERED") `
    -Message "Recovery status code was not persisted."
  $safeFailureMessage = Get-RecoveryStatusMessage -Code "MANAGED_RECONCILIATION_FAILED"
  Assert-True `
    -Condition (
      -not $safeFailureMessage.Contains($temporaryRoot) -and
      -not $safeFailureMessage.Contains($env:USERPROFILE)
    ) `
    -Message "Recovery status messages expose a local path."

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

  $localizedAccessDenied = [pscustomobject]@{
    FullyQualifiedErrorId = "HRESULT 0x80070005,Register-ScheduledTask"
    Exception = [pscustomobject]@{
      NativeErrorCode = 1
      ErrorData = [pscustomobject]@{
        MessageID = "HRESULT 0x80070005"
        error_Code = [uint64] 2147942405
      }
    }
  }
  Assert-True `
    -Condition (Test-ScheduledTaskAccessDenied -ErrorRecord $localizedAccessDenied) `
    -Message "Localized Task Scheduler HRESULT 0x80070005 was not recognized."

  $errorDataOnlyAccessDenied = [pscustomobject]@{
    FullyQualifiedErrorId = "Register-ScheduledTask"
    Exception = [pscustomobject]@{
      NativeErrorCode = 1
      ErrorData = [pscustomobject]@{
        MessageID = "HRESULT 0x80070005"
        error_Code = [uint64] 2147942405
      }
    }
  }
  Assert-True `
    -Condition (Test-ScheduledTaskAccessDenied -ErrorRecord $errorDataOnlyAccessDenied) `
    -Message "Task Scheduler ErrorData access-denied code was not recognized."

  $differentSchedulerFailure = [pscustomobject]@{
    FullyQualifiedErrorId = "HRESULT 0x80070020,Register-ScheduledTask"
    Exception = [pscustomobject]@{
      NativeErrorCode = 32
      ErrorData = [pscustomobject]@{
        MessageID = "HRESULT 0x80070020"
        error_Code = [uint64] 2147942432
      }
    }
  }
  Assert-True `
    -Condition (-not (
        Test-ScheduledTaskAccessDenied -ErrorRecord $differentSchedulerFailure
      )) `
    -Message "An unrelated Task Scheduler failure was classified as access denied."

  Write-Utf8NoBom `
    -Path $script:HiddenLauncherPath `
    -Content ((Get-HiddenLauncherContent).Trim() + "`r`n")
  $fallbackManagedTask = [pscustomobject]@{
    TaskPath = $script:TaskPath
    Description = ""
    Actions = @([pscustomobject]@{
        Execute = $script:WscriptPath
        Arguments = '//B //NoLogo ' + $script:HiddenLauncherPath
      })
    Principal = [pscustomobject]@{
      UserId = ($script:TaskUserId -split "\\")[-1]
      LogonType = "Interactive"
      RunLevel = "Limited"
    }
    Triggers = @([pscustomobject]@{ Schedule = "MINUTE"; Modifier = 5 })
  }
  Assert-True `
    -Condition (Test-ManagedTask -Task $fallbackManagedTask) `
    -Message "The marker-backed schtasks fallback was not recognized as managed."
  Remove-Item -LiteralPath $script:HiddenLauncherPath -Force

  $script:registeredTask = $null
  $script:registeredTaskName = $null
  $script:unregisteredTaskName = $null
  $script:schTasksInvocations = @()
  $script:denyRegistration = $false
  $script:denyUnregistration = $false
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
    if ($script:denyRegistration) {
      throw (New-Object System.UnauthorizedAccessException("Access is denied."))
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
    if ($script:denyUnregistration) {
      throw (New-Object System.UnauthorizedAccessException("Access is denied."))
    }
    $script:unregisteredTaskName = $TaskName
    $script:unregisteredTaskPath = $TaskPath
    $script:registeredTask = $null
  }
  function Invoke-SchtasksChecked {
    param([string[]] $Arguments)
    $script:schTasksInvocations += ,@($Arguments)
    if ($Arguments[0] -eq "/Create") {
      $script:registeredTaskName = $script:TaskName
      $script:registeredTask = [pscustomobject]@{
        TaskPath = $script:TaskPath
        Description = ""
        Actions = @([pscustomobject]@{
            Execute = $script:WscriptPath
            Arguments = '//B //NoLogo ' + $script:HiddenLauncherPath
          })
        Triggers = @([pscustomobject]@{ Schedule = "MINUTE"; Modifier = 5 })
        Principal = [pscustomobject]@{
          UserId = ($script:TaskUserId -split "\\")[-1]
          LogonType = "Interactive"
          RunLevel = "Limited"
        }
      }
      return @("created")
    }
    if ($Arguments[0] -eq "/Delete") {
      $script:registeredTask = $null
      return @("deleted")
    }
    throw "Unexpected schtasks invocation."
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
    -Condition (-not (Test-Path -LiteralPath $script:RecoveryStatusPath)) `
    -Message "Recovery rollback left the managed status file."

  $script:denyRegistration = $true
  $script:schTasksInvocations = @()
  Install-Recovery
  $script:denyRegistration = $false
  Assert-True `
    -Condition (Test-ManagedTask -Task $script:registeredTask) `
    -Message "Access-denied registration did not install the exact managed fallback task."
  $createInvocation = @($script:schTasksInvocations[0])
  Assert-True `
    -Condition (
      $createInvocation -contains "/Create" -and
      $createInvocation -contains "/SC" -and
      $createInvocation -contains "MINUTE" -and
      $createInvocation -contains "/MO" -and
      $createInvocation -contains "5" -and
      $createInvocation -contains "/RL" -and
      $createInvocation -contains "LIMITED"
    ) `
    -Message "Access-denied fallback did not request the accepted five-minute limited schedule."
  Assert-True `
    -Condition ((Get-RecoveryTaskFullName) -eq "\dpkr helix Recovery") `
    -Message "Fallback task name escaped the accepted root task path."

  $script:denyUnregistration = $true
  Remove-Recovery
  $script:denyUnregistration = $false
  Assert-True `
    -Condition (-not $script:registeredTask) `
    -Message "Access-denied removal did not delete the exact managed fallback task."
  $deleteInvocation = @($script:schTasksInvocations[-1])
  Assert-True `
    -Condition (
      $deleteInvocation -contains "/Delete" -and
      $deleteInvocation -contains "\dpkr helix Recovery"
    ) `
    -Message "Access-denied removal did not target the exact managed fallback task."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:ManagedRecoveryPath)) `
    -Message "Fallback removal left the managed recovery script."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $script:HiddenLauncherPath)) `
    -Message "Fallback removal left the hidden launcher."

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
  Assert-True `
    -Condition (
      $sourceText.Contains('Register-RecoveryTaskWithSchtasks') -and
      $sourceText.Contains('"/SC", "MINUTE"') -and
      $sourceText.Contains('"/MO", "5"') -and
      $sourceText.Contains('"/RL", "LIMITED"')
    ) `
    -Message "Recovery script does not define the accepted current-user schtasks fallback."
  Assert-True `
    -Condition (
      $sourceText.Contains('windows-recovery.json') -and
      $sourceText.Contains('dpkr-helix-windows-recovery/v1')
    ) `
    -Message "Recovery does not persist a bounded managed diagnostic status."
  Assert-True `
    -Condition $sourceText.Contains('/.well-known/oauth-protected-resource/mcp') `
    -Message "Recovery does not verify OAuth protected-resource metadata."
  Assert-True `
    -Condition $sourceText.Contains('MANAGED_RECONCILIATION_FAILED') `
    -Message "Recovery reconciliation failures do not expose a stable reason code."

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
  Assert-True -Condition $planOutput.Contains("package fingerprint") -Message "Recovery Plan omitted runtime attestation."
}
finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

Write-Host "setup-windows recovery tests: pass"
