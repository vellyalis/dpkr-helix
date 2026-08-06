#requires -Version 5.1

<#
.SYNOPSIS
Installs, removes, previews, or runs optional no-console dpkr helix recovery.

.DESCRIPTION
The recovery task is available only for a portable Windows installation using
TunnelMode External with a stable HTTPS origin. It calls the existing managed
setup-windows.ps1 Start mode to attest package/runtime identity, configuration,
local health, and local OAuth metadata without restarting a healthy generation,
then verifies the public health and OAuth boundary.

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

function Write-JsonAtomic {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)] $Value
  )
  $directory = Split-Path -Parent $Path
  if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $temporaryPath = Join-Path $directory (
    ".tmp-" + [Guid]::NewGuid().ToString("N") + ".json"
  )
  try {
    Write-Utf8NoBom `
      -Path $temporaryPath `
      -Content (($Value | ConvertTo-Json -Depth 8) + "`n")
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
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

function Get-UriOrigin {
  param([Parameter(Mandatory = $true)][string] $Value)
  try {
    $uri = New-Object System.Uri($Value)
  }
  catch {
    throw "OAuth metadata contains an invalid absolute URL."
  }
  if (-not $uri.IsAbsoluteUri -or -not $uri.Host) {
    throw "OAuth metadata contains an invalid absolute URL."
  }
  return $uri.GetLeftPart([System.UriPartial]::Authority).TrimEnd("/")
}

function Assert-UriUsesOrigin {
  param(
    [Parameter(Mandatory = $true)][string] $Value,
    [Parameter(Mandatory = $true)][string] $ExpectedOrigin,
    [Parameter(Mandatory = $true)][string] $FieldName
  )
  $actualOrigin = Get-UriOrigin -Value $Value
  if (-not [string]::Equals(
      $actualOrigin,
      $ExpectedOrigin,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "$FieldName advertises $actualOrigin instead of $ExpectedOrigin."
  }
}

function Test-OAuthMetadata {
  param(
    [Parameter(Mandatory = $true)][string] $Origin,
    [Parameter(Mandatory = $true)][string] $ExpectedPublicOrigin,
    [int] $TimeoutSeconds = 10
  )
  $expectedOrigin = Normalize-StableOrigin -Value $ExpectedPublicOrigin
  $requestOrigin = $Origin.TrimEnd("/")
  $authorizationMetadataUri = $requestOrigin + "/.well-known/oauth-authorization-server"
  $response = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri $authorizationMetadataUri `
    -Headers @{
      Accept = "application/json"
      "User-Agent" = "dpkr-helix-windows-recovery/1.0"
    } `
    -TimeoutSec $TimeoutSeconds
  if ([int] $response.StatusCode -ne 200) {
    throw "OAuth metadata returned HTTP $($response.StatusCode)."
  }
  $metadata = $response.Content | ConvertFrom-Json
  foreach ($fieldName in @(
      "issuer",
      "authorization_endpoint",
      "token_endpoint",
      "registration_endpoint"
    )) {
    $value = [string](Get-PropertyValue -InputObject $metadata -Name $fieldName)
    if (-not $value) {
      throw "OAuth metadata is missing $fieldName."
    }
    Assert-UriUsesOrigin `
      -Value $value `
      -ExpectedOrigin $expectedOrigin `
      -FieldName $fieldName
  }
  $revocationEndpoint = [string](
    Get-PropertyValue -InputObject $metadata -Name "revocation_endpoint"
  )
  if ($revocationEndpoint) {
    Assert-UriUsesOrigin `
      -Value $revocationEndpoint `
      -ExpectedOrigin $expectedOrigin `
      -FieldName "revocation_endpoint"
  }

  $protectedResourceUri = $requestOrigin + "/.well-known/oauth-protected-resource/mcp"
  $protectedResponse = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri $protectedResourceUri `
    -Headers @{
      Accept = "application/json"
      "User-Agent" = "dpkr-helix-windows-recovery/1.0"
    } `
    -TimeoutSec $TimeoutSeconds
  if ([int] $protectedResponse.StatusCode -ne 200) {
    throw "OAuth protected-resource metadata returned HTTP $($protectedResponse.StatusCode)."
  }
  $protected = $protectedResponse.Content | ConvertFrom-Json
  $expectedResource = $expectedOrigin + "/mcp"
  if (-not [string]::Equals(
      [string](Get-PropertyValue -InputObject $protected -Name "resource"),
      $expectedResource,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "OAuth protected-resource metadata does not advertise $expectedResource."
  }
  $authorizationServerMatches = $false
  foreach ($server in @(
      Get-PropertyValue -InputObject $protected -Name "authorization_servers"
    )) {
    if (-not $server) {
      continue
    }
    try {
      if ([string]::Equals(
          (Get-UriOrigin -Value ([string] $server)),
          $expectedOrigin,
          [System.StringComparison]::OrdinalIgnoreCase
        )) {
        $authorizationServerMatches = $true
        break
      }
    }
    catch {
      continue
    }
  }
  if (-not $authorizationServerMatches) {
    throw "OAuth protected-resource metadata advertises the wrong authorization server."
  }
}

function Write-RecoveryStatus {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("healthy", "recovered", "skipped", "failed")]
    [string] $State,
    [Parameter(Mandatory = $true)][string] $Code,
    [Parameter(Mandatory = $true)][string] $Message
  )
  Write-JsonAtomic -Path $script:RecoveryStatusPath -Value ([ordered]@{
      schema = "dpkr-helix-windows-recovery/v1"
      state = $State
      code = $Code
      message = $Message
      checkedAt = [DateTime]::UtcNow.ToString("o")
    })
}

function Throw-RecoveryFailure {
  param(
    [Parameter(Mandatory = $true)][string] $Code,
    [Parameter(Mandatory = $true)][string] $Message
  )
  throw "DPKR_RECOVERY[$Code] $Message"
}

function Get-RecoveryFailureCode {
  param([Parameter(Mandatory = $true)] $ErrorRecord)
  $match = [regex]::Match(
    [string] $ErrorRecord.Exception.Message,
    "^DPKR_RECOVERY\[([A-Z0-9_]+)\]"
  )
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  return "RECOVERY_FAILED"
}

function Get-RecoveryStatusMessage {
  param([Parameter(Mandatory = $true)][string] $Code)
  switch ($Code) {
    "MANAGED_RECONCILIATION_FAILED" {
      return "Managed DevSpace reconciliation failed. Review the local recovery and DevSpace logs."
    }
    "LOCAL_HEALTH_UNRECOVERED" {
      return "Local DevSpace health remains unavailable after managed reconciliation."
    }
    "PUBLIC_ENDPOINT_UNHEALTHY" {
      return "The public endpoint is unavailable while the attested local process remains healthy."
    }
    "PUBLIC_HEALTH_UNRECOVERED" {
      return "The public endpoint remains unavailable after local DevSpace recovery."
    }
    "OAUTH_METADATA_MISMATCH" {
      return "OAuth metadata does not match the saved stable origin."
    }
    default {
      return "Recovery failed before a safe detailed status could be recorded. Review the local recovery logs."
    }
  }
}

function Get-RuntimeIdentityStamp {
  try {
    $runtime = Read-JsonFile -Path $script:RuntimeStatePath
    if (-not $runtime) {
      return $null
    }
    $pidValue = [int](Get-PropertyValue -InputObject $runtime -Name "devspacePid")
    $started = [long](
      Get-PropertyValue -InputObject $runtime -Name "devspaceStartTimeFileTimeUtc"
    )
    $fingerprint = [string](
      Get-PropertyValue -InputObject $runtime -Name "devspaceRuntimeFingerprint"
    )
    if ($pidValue -le 0 -or $started -le 0) {
      return $null
    }
    return "$pidValue|$started|$fingerprint"
  }
  catch {
    return $null
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
  if (-not $process.WaitForExit(120000)) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Managed DevSpace reconciliation exceeded 120 seconds."
  }
  if ($process.ExitCode -ne 0) {
    throw "Managed DevSpace reconciliation failed with exit code $($process.ExitCode)."
  }
}

function Invoke-Recovery {
  $settings = Get-RecoverySettings
  if ($settings.DesiredState -ne "running") {
    return [pscustomobject]@{
      State = "skipped"
      Code = "INTENTIONALLY_STOPPED"
      Message = "Recovery skipped: DevSpace was intentionally stopped."
    }
  }
  if (Test-RuntimeOperationInProgress) {
    return [pscustomobject]@{
      State = "skipped"
      Code = "OPERATION_IN_PROGRESS"
      Message = "Recovery skipped: another managed start, stop, install, or update is active."
    }
  }

  $localHealth = "http://127.0.0.1:$($settings.Port)/healthz"
  $publicHealth = "$($settings.PublicBaseUrl)/healthz"
  $localWasHealthy = Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3
  if (-not $localWasHealthy) {
    Start-Sleep -Seconds 1
    $localWasHealthy = Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3
  }
  $identityBefore = Get-RuntimeIdentityStamp
  try {
    Invoke-ManagedStart
  }
  catch {
    Throw-RecoveryFailure `
      -Code "MANAGED_RECONCILIATION_FAILED" `
      -Message (Get-RecoveryStatusMessage -Code "MANAGED_RECONCILIATION_FAILED")
  }
  $identityAfter = Get-RuntimeIdentityStamp
  $runtimeChanged = -not [string]::Equals(
    [string] $identityBefore,
    [string] $identityAfter,
    [System.StringComparison]::Ordinal
  )
  if (-not (Test-HttpEndpoint -Uri $localHealth -TimeoutSeconds 3)) {
    Throw-RecoveryFailure `
      -Code "LOCAL_HEALTH_UNRECOVERED" `
      -Message "Local DevSpace health remains unavailable after managed reconciliation."
  }
  if (-not (Test-HttpEndpoint -Uri $publicHealth)) {
    if ($localWasHealthy -and -not $runtimeChanged) {
      Throw-RecoveryFailure `
        -Code "PUBLIC_ENDPOINT_UNHEALTHY" `
        -Message "The public endpoint is unhealthy while the attested local process remains healthy; recover the external tunnel owner without restarting DevSpace."
    }
    Throw-RecoveryFailure `
      -Code "PUBLIC_HEALTH_UNRECOVERED" `
      -Message "The public endpoint remains unavailable after local DevSpace recovery."
  }
  try {
    Test-OAuthMetadata `
      -Origin "http://127.0.0.1:$($settings.Port)" `
      -ExpectedPublicOrigin $settings.PublicBaseUrl `
      -TimeoutSeconds 3
    Test-OAuthMetadata `
      -Origin $settings.PublicBaseUrl `
      -ExpectedPublicOrigin $settings.PublicBaseUrl
  }
  catch {
    Throw-RecoveryFailure `
      -Code "OAUTH_METADATA_MISMATCH" `
      -Message (Get-RecoveryStatusMessage -Code "OAUTH_METADATA_MISMATCH")
  }
  if ($runtimeChanged) {
    return [pscustomobject]@{
      State = "recovered"
      Code = "RUNTIME_RECOVERED"
      Message = "Recovery check: runtime integrity, local/public health, and OAuth metadata were restored."
    }
  }
  return [pscustomobject]@{
    State = "healthy"
    Code = "HEALTHY"
    Message = "Recovery check: runtime integrity, local/public health, and OAuth metadata pass."
  }
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

function Get-TaskUserSid {
  param([Parameter(Mandatory = $true)][string] $Value)
  if ($Value -match "^S-1-") {
    return $Value.ToUpperInvariant()
  }
  try {
    $account = New-Object System.Security.Principal.NTAccount($Value)
    return $account.Translate(
      [System.Security.Principal.SecurityIdentifier]
    ).Value.ToUpperInvariant()
  }
  catch {
    return $Value.ToUpperInvariant()
  }
}

function Test-ScheduledTaskAccessDenied {
  param([Parameter(Mandatory = $true)] $ErrorRecord)
  if ($ErrorRecord.Exception -is [System.UnauthorizedAccessException]) {
    return $true
  }
  $fullyQualifiedErrorId = [string](
    Get-PropertyValue -InputObject $ErrorRecord -Name "FullyQualifiedErrorId"
  )
  if ($fullyQualifiedErrorId -match "(?i)\bHRESULT\s+0x80070005\b") {
    return $true
  }
  $nativeErrorCode = Get-PropertyValue `
    -InputObject $ErrorRecord.Exception `
    -Name "NativeErrorCode"
  if ($nativeErrorCode -and [int] $nativeErrorCode -eq 5) {
    return $true
  }
  $errorData = Get-PropertyValue `
    -InputObject $ErrorRecord.Exception `
    -Name "ErrorData"
  if ($errorData) {
    $messageId = [string](
      Get-PropertyValue -InputObject $errorData -Name "MessageID"
    )
    if ($messageId -match "(?i)^HRESULT\s+0x80070005$") {
      return $true
    }
    $windowsErrorCode = Get-PropertyValue `
      -InputObject $errorData `
      -Name "error_Code"
    if ($null -ne $windowsErrorCode) {
      try {
        if ([uint64] $windowsErrorCode -eq [uint64] 2147942405) {
          return $true
        }
      }
      catch {
        # Ignore malformed provider metadata and continue to the bounded fallback check.
      }
    }
  }
  return ([string] $ErrorRecord) -match "(?i)0x80070005|access.+denied"
}

function Get-RecoveryTaskFullName {
  return $script:TaskPath.TrimEnd("\") + "\" + $script:TaskName
}

function Invoke-SchtasksChecked {
  param([Parameter(Mandatory = $true)][string[]] $Arguments)
  if (-not (Test-Path -LiteralPath $script:SchtasksPath -PathType Leaf)) {
    throw "schtasks.exe is unavailable."
  }
  $output = @(& $script:SchtasksPath @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Task Scheduler command failed with exit code $exitCode."
  }
  return $output
}

function Register-RecoveryTaskWithSchtasks {
  $taskCommand = (
    '"' + $script:WscriptPath + '" //B //NoLogo "' +
    $script:HiddenLauncherPath + '"'
  )
  Invoke-SchtasksChecked -Arguments @(
    "/Create",
    "/TN", (Get-RecoveryTaskFullName),
    "/TR", $taskCommand,
    "/SC", "MINUTE",
    "/MO", "5",
    "/RL", "LIMITED",
    "/F",
    "/HRESULT"
  ) | Out-Null
}

function Remove-RecoveryTaskWithSchtasks {
  Invoke-SchtasksChecked -Arguments @(
    "/Delete",
    "/TN", (Get-RecoveryTaskFullName),
    "/F",
    "/HRESULT"
  ) | Out-Null
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
  $actualArguments = [string]$action.Arguments
  $argumentsMatch = [string]::Equals(
    $actualArguments,
    $expectedArguments,
    [System.StringComparison]::Ordinal
  )
  if (-not $argumentsMatch -and $script:HiddenLauncherPath -notmatch "\s") {
    $argumentsMatch = [string]::Equals(
      $actualArguments,
      ('//B //NoLogo ' + $script:HiddenLauncherPath),
      [System.StringComparison]::Ordinal
    )
  }
  $description = [string](Get-PropertyValue -InputObject $Task -Name "Description")
  $descriptionMatches = [string]::Equals(
    $description,
    $script:TaskDescription,
    [System.StringComparison]::Ordinal
  )
  if (-not $descriptionMatches -and [string]::IsNullOrWhiteSpace($description)) {
    try {
      $descriptionMatches = (
        (Test-Path -LiteralPath $script:HiddenLauncherPath -PathType Leaf) -and
        (Read-Utf8Text -Path $script:HiddenLauncherPath).Contains($script:ManagedMarker)
      )
    }
    catch {
      $descriptionMatches = $false
    }
  }
  $actualUserId = [string](Get-PropertyValue -InputObject $principal -Name "UserId")
  $userMatches = [string]::Equals(
    (Get-TaskUserSid -Value $actualUserId),
    (Get-TaskUserSid -Value $script:TaskUserId),
    [System.StringComparison]::OrdinalIgnoreCase
  )
  return (
    [string]::Equals(
      [string](Get-PropertyValue -InputObject $Task -Name "TaskPath"),
      $script:TaskPath,
      [System.StringComparison]::Ordinal
    ) -and $descriptionMatches -and $userMatches -and [string]::Equals(
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
    ) -and $argumentsMatch
  )
}

function Remove-ManagedRecoveryTask {
  $existingTask = Get-ScheduledTask `
    -TaskName $script:TaskName `
    -TaskPath $script:TaskPath `
    -ErrorAction SilentlyContinue
  if (-not $existingTask) {
    return
  }
  if (-not (Test-ManagedTask -Task $existingTask)) {
    throw "Refusing to remove an unmanaged Scheduled Task named '$($script:TaskName)'."
  }
  try {
    Unregister-ScheduledTask `
      -TaskName $script:TaskName `
      -TaskPath $script:TaskPath `
      -Confirm:$false
  }
  catch {
    if (-not (Test-ScheduledTaskAccessDenied -ErrorRecord $_)) {
      throw
    }
    Write-Warning "ScheduledTasks removal was denied; using the current-user schtasks fallback."
    Remove-RecoveryTaskWithSchtasks
  }
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
    try {
      Register-ScheduledTask `
        -TaskName $script:TaskName `
        -TaskPath $script:TaskPath `
        -Action $action `
        -Trigger @($repeatTrigger, $logonTrigger) `
        -Principal $principal `
        -Settings $settings `
        -Description $script:TaskDescription `
        -Force | Out-Null
    }
    catch {
      if (-not (Test-ScheduledTaskAccessDenied -ErrorRecord $_)) {
        throw
      }
      Write-Warning "ScheduledTasks registration was denied; using the current-user schtasks fallback."
      Register-RecoveryTaskWithSchtasks
    }

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
      try {
        Remove-ManagedRecoveryTask
      }
      catch {
        Write-Warning "Failed recovery registration cleanup could not remove the managed task: $($_.Exception.Message)"
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
  Remove-ManagedRecoveryTask
  foreach ($path in @($script:HiddenLauncherPath, $script:ManagedRecoveryPath)) {
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      Assert-ManagedFile -Path $path
      Remove-Item -LiteralPath $path -Force
    }
  }
  if (Test-Path -LiteralPath $script:RecoveryStatusPath -PathType Leaf) {
    $status = Read-JsonFile -Path $script:RecoveryStatusPath
    if (
      -not $status -or
      [string](Get-PropertyValue -InputObject $status -Name "schema") -ne
        "dpkr-helix-windows-recovery/v1"
    ) {
      throw "Refusing to remove an unmanaged recovery status file."
    }
    Remove-Item -LiteralPath $script:RecoveryStatusPath -Force
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
    Triggers = "current-user logon and every five minutes; access-denied fallback uses the current-user five-minute schedule"
    Writes = "$script:ManagedRecoveryPath; $script:HiddenLauncherPath; $script:RecoveryStatusPath; current-user Scheduled Task"
    RestartRule = "reconcile runtime identity, package fingerprint, config origin, and local OAuth metadata; restart only when attestation fails"
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
    try {
      $result = Invoke-Recovery
      Write-RecoveryStatus `
        -State ([string] $result.State) `
        -Code ([string] $result.Code) `
        -Message ([string] $result.Message)
      Write-Host ([string] $result.Message)
    }
    catch {
      $failure = $_
      $code = Get-RecoveryFailureCode -ErrorRecord $failure
      $message = Get-RecoveryStatusMessage -Code $code
      try {
        Write-RecoveryStatus -State "failed" -Code $code -Message $message
      }
      catch {
        Write-Warning "Recovery status could not be persisted: $($_.Exception.Message)"
      }
      throw $failure
    }
  }
}
