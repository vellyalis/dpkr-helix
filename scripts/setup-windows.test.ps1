#requires -Version 5.1

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$setupPath = Join-Path $PSScriptRoot "setup-windows.ps1"
$sourceText = Get-Content -LiteralPath $setupPath -Raw
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
  $setupPath,
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

function Get-SetupFunctionSource {
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
      throw "Setup function was not found: $name"
    }
    $selected += $definition.Extent.Text
  }
  return $selected -join "`n`n"
}

. ([ScriptBlock]::Create(
    (Get-SetupFunctionSource -Names @(
        "Write-Utf8NoBom",
        "Write-JsonAtomic",
        "Read-Utf8Text",
        "Read-Utf8TextShared",
        "Read-JsonFile",
        "Enter-RuntimeOperation",
        "Exit-RuntimeOperation",
        "Get-DesiredRuntimeState",
        "Set-DesiredRuntimeState",
        "Rotate-LogFile",
        "Get-PropertyValue",
        "Normalize-HttpsOrigin",
        "Copy-FileAtomic",
        "Sync-ManagedSetupScript",
        "Sync-ManagedRecoveryScript",
        "Write-UpdateStatus",
        "Get-CommandPath",
        "Invoke-Checked",
        "Invoke-CapturedChecked",
        "Throw-UpdateFailure",
        "Get-UpdateFailureCode",
        "Get-SourceUpdatePlan",
        "New-UpdateTemporaryRoot",
        "Remove-UpdateTemporaryRoot",
        "Get-SourceUpdatePlanWithoutFetch",
        "Assert-UpdatePlanStillCurrent",
        "Restore-UpdateDeployment",
        "Test-OAuthMetadata",
        "New-OwnerToken",
        "ConvertTo-TomlBasicString",
        "Get-ProcessRecord",
        "Get-TrackedProcessIdentity",
        "Stop-TrackedProcess",
        "Stop-DevSpaceRuntime",
        "Start-QuickTunnel"
      ))
  ))

$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "devspace-setup-windows-test-" + [Guid]::NewGuid().ToString("N")
)
New-Item -ItemType Directory -Path $temporaryRoot | Out-Null

try {
  $unicodeText = [string]([char] 0x6625) + [char] 0x306E + [char] 0x7A93
  $jsonPath = Join-Path $temporaryRoot "round-trip.json"
  $expectedJson = [ordered]@{
    host = "127.0.0.1"
    allowedRoots = @("C:\src\project-a", "C:\src\project-b")
    nested = [ordered]@{ preserved = $true }
    unicode = $unicodeText
  }
  Write-JsonAtomic -Path $jsonPath -Value $expectedJson
  $bytes = [System.IO.File]::ReadAllBytes($jsonPath)
  $hasBom = $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xEF -and
    $bytes[1] -eq 0xBB -and
    $bytes[2] -eq 0xBF
  Assert-True -Condition (-not $hasBom) -Message "JSON writer emitted a UTF-8 BOM."
  $roundTrip = Read-JsonFile -Path $jsonPath
  Assert-True -Condition ($roundTrip.host -eq "127.0.0.1") -Message "JSON host did not round-trip."
  Assert-True -Condition ($roundTrip.allowedRoots.Count -eq 2) -Message "JSON roots did not round-trip."
  Assert-True -Condition ($roundTrip.nested.preserved -eq $true) -Message "Nested JSON did not round-trip."
  Assert-True -Condition ($roundTrip.unicode -eq $unicodeText) -Message "UTF-8 JSON did not round-trip."

  $script:SettingsPath = Join-Path $temporaryRoot "desired-state.json"
  $script:RuntimeStatePath = Join-Path $temporaryRoot "runtime.json"
  Write-JsonAtomic -Path $script:SettingsPath -Value ([ordered]@{ schema = "fixture" })
  Set-DesiredRuntimeState -State "running" | Out-Null
  Assert-True `
    -Condition ((Read-JsonFile -Path $script:SettingsPath).desiredState -eq "running") `
    -Message "Desired running state was not persisted."

  $script:RuntimeMutexName = "Local\dpkr-helix-setup-test-" + [Guid]::NewGuid().ToString("N")
  $runtimeMutex = Enter-RuntimeOperation -TimeoutMilliseconds 0
  Exit-RuntimeOperation -Mutex $runtimeMutex

  $activeLog = Join-Path $temporaryRoot "active.log"
  [System.IO.File]::WriteAllText($activeLog, "current failure evidence")
  Rotate-LogFile -Path $activeLog
  Assert-True `
    -Condition ((Get-Content -LiteralPath "$activeLog.previous" -Raw) -eq "current failure evidence") `
    -Message "Restart log rotation did not retain the previous session."

  $managedSourcePath = Join-Path $temporaryRoot "setup-source.ps1"
  $script:ManagedScriptPath = Join-Path $temporaryRoot "managed\setup-windows.ps1"
  New-Item -ItemType Directory -Path (Split-Path -Parent $script:ManagedScriptPath) | Out-Null
  [System.IO.File]::WriteAllText($managedSourcePath, "managed setup content")
  Sync-ManagedSetupScript -SourcePath $managedSourcePath
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedScriptPath -Raw) -eq "managed setup content") `
    -Message "Managed setup script was not copied from a distinct source."
  Sync-ManagedSetupScript -SourcePath $script:ManagedScriptPath
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedScriptPath -Raw) -eq "managed setup content") `
    -Message "Managed setup self-sync changed its own content."

  $script:ManagedRecoveryMarker = "managed-by-dpkr-helix-windows-recovery"
  $recoverySourcePath = Join-Path $temporaryRoot "setup-recovery-source.ps1"
  $script:ManagedRecoveryPath = Join-Path $temporaryRoot "managed\setup-windows-recovery.ps1"
  [System.IO.File]::WriteAllText(
    $recoverySourcePath,
    "# managed-by-dpkr-helix-windows-recovery`r`nnew recovery content"
  )
  [System.IO.File]::WriteAllText(
    $script:ManagedRecoveryPath,
    "# managed-by-dpkr-helix-windows-recovery`r`nold recovery content"
  )
  Sync-ManagedRecoveryScript -SourcePath $recoverySourcePath
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedRecoveryPath -Raw).Contains("new recovery content")) `
    -Message "Managed recovery script was not updated atomically."
  [System.IO.File]::WriteAllText($script:ManagedRecoveryPath, "unmanaged recovery content")
  $unmanagedRecoveryRejected = $false
  try {
    Sync-ManagedRecoveryScript -SourcePath $recoverySourcePath
  }
  catch {
    $unmanagedRecoveryRejected = $true
  }
  Assert-True `
    -Condition $unmanagedRecoveryRejected `
    -Message "An unmanaged recovery script was replaced by update sync."

  $script:UpdateStatusPath = Join-Path $temporaryRoot "windows-update.json"
  Write-UpdateStatus `
    -State "preflight" `
    -RequestId "00000000-0000-4000-8000-000000000005" `
    -FromCommit (("a" * 40) -join "") `
    -TargetCommit (("b" * 40) -join "") `
    -StartedAt "2026-08-01T00:00:00.000Z"
  $updateStatus = Read-JsonFile -Path $script:UpdateStatusPath
  Assert-True -Condition ($updateStatus.state -eq "preflight") -Message "Update status state was not persisted."
  Assert-True -Condition ($updateStatus.completedAt -eq $null) -Message "Active update status was marked complete."

  $updateTemporaryRoot = New-UpdateTemporaryRoot
  Assert-True `
    -Condition (Test-Path -LiteralPath $updateTemporaryRoot -PathType Container) `
    -Message "Update temporary root was not created."
  Remove-UpdateTemporaryRoot -Path $updateTemporaryRoot
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $updateTemporaryRoot)) `
    -Message "Validated update temporary root was not removed."

  $gitFixture = Join-Path $temporaryRoot "git-update"
  $gitOrigin = Join-Path $gitFixture "origin.git"
  $gitSeed = Join-Path $gitFixture "seed"
  $gitManaged = Join-Path $gitFixture "managed"
  New-Item -ItemType Directory -Path $gitFixture | Out-Null
  Invoke-Checked -FilePath "git.exe" -Arguments @("init", "--bare", "--initial-branch=main", $gitOrigin)
  Invoke-Checked -FilePath "git.exe" -Arguments @("init", "--initial-branch=main", $gitSeed)
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "config", "user.email", "update-test@example.com")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "config", "user.name", "Update Test")
  [System.IO.File]::WriteAllText((Join-Path $gitSeed "version.txt"), "one")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "add", "version.txt")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "-c", "commit.gpgsign=false", "commit", "-m", "one")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "remote", "add", "origin", $gitOrigin)
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "push", "-u", "origin", "main")
  Invoke-Checked -FilePath "git.exe" -Arguments @("clone", "--branch", "main", $gitOrigin, $gitManaged)
  $script:CanonicalOriginUrl = $gitOrigin
  $samePlan = Get-SourceUpdatePlan -Root $gitManaged
  Assert-True `
    -Condition ($samePlan.FromCommit -eq $samePlan.TargetCommit) `
    -Message "An up-to-date managed main checkout was not recognized."

  [System.IO.File]::WriteAllText((Join-Path $gitSeed "version.txt"), "two")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "add", "version.txt")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "-c", "commit.gpgsign=false", "commit", "-m", "two")
  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitSeed, "push", "origin", "main")
  $advancePlan = Get-SourceUpdatePlan -Root $gitManaged
  Assert-True `
    -Condition ($advancePlan.FromCommit -ne $advancePlan.TargetCommit) `
    -Message "A fast-forward origin/main update was not discovered."

  Invoke-Checked -FilePath "git.exe" -Arguments @(
    "-C", $gitManaged, "remote", "set-url", "origin", "https://example.com/replaced.git"
  )
  $changedOriginCode = $null
  try {
    Assert-UpdatePlanStillCurrent -Plan $advancePlan
  }
  catch {
    $changedOriginCode = Get-UpdateFailureCode -ErrorRecord $_
  }
  finally {
    Invoke-Checked -FilePath "git.exe" -Arguments @(
      "-C", $gitManaged, "remote", "set-url", "origin", $gitOrigin
    )
  }
  Assert-True `
    -Condition ($changedOriginCode -eq "SOURCE_CHANGED_DURING_PREFLIGHT") `
    -Message "An origin replacement during preflight was not rejected."

  [System.IO.File]::WriteAllText((Join-Path $gitManaged "untracked.txt"), "local")
  $dirtyCode = $null
  try {
    Get-SourceUpdatePlan -Root $gitManaged | Out-Null
  }
  catch {
    $dirtyCode = Get-UpdateFailureCode -ErrorRecord $_
  }
  Assert-True -Condition ($dirtyCode -eq "DIRTY_WORKTREE") -Message "A dirty update source was not rejected."
  Remove-Item -LiteralPath (Join-Path $gitManaged "untracked.txt") -Force

  $script:CanonicalOriginUrl = "https://example.com/untrusted.git"
  $originCode = $null
  try {
    Get-SourceUpdatePlan -Root $gitManaged | Out-Null
  }
  catch {
    $originCode = Get-UpdateFailureCode -ErrorRecord $_
  }
  Assert-True -Condition ($originCode -eq "UNTRUSTED_ORIGIN") -Message "A noncanonical update origin was accepted."
  $script:CanonicalOriginUrl = $gitOrigin

  Invoke-Checked -FilePath "git.exe" -Arguments @("-C", $gitManaged, "switch", "-c", "feature")
  $branchCode = $null
  try {
    Get-SourceUpdatePlan -Root $gitManaged | Out-Null
  }
  catch {
    $branchCode = Get-UpdateFailureCode -ErrorRecord $_
  }
  Assert-True -Condition ($branchCode -eq "WRONG_BRANCH") -Message "A non-main update source was not rejected."

  Invoke-Checked -FilePath "git.exe" -Arguments @(
    "-C", $gitManaged, "merge", "--ff-only", ([string] $advancePlan.TargetCommit)
  )
  $rollbackSetupBackup = Join-Path $temporaryRoot "rollback-setup.ps1"
  $rollbackRecoveryBackup = Join-Path $temporaryRoot "rollback-recovery.ps1"
  $script:ManagedScriptPath = Join-Path $temporaryRoot "managed-restore\setup-windows.ps1"
  $script:ManagedRecoveryPath = Join-Path $temporaryRoot "managed-restore\setup-windows-recovery.ps1"
  $script:SettingsPath = Join-Path $temporaryRoot "restore-settings.json"
  [System.IO.File]::WriteAllText($rollbackSetupBackup, "previous setup")
  [System.IO.File]::WriteAllText($rollbackRecoveryBackup, "previous recovery")
  Write-JsonAtomic -Path $script:SettingsPath -Value ([ordered]@{ desiredState = "running" })
  $script:rollbackPackageSeen = $null
  $script:rollbackStopSeen = $false
  function Stop-DevSpaceRuntime {
    $script:rollbackStopSeen = $true
  }
  function Install-BuiltDevSpacePackage {
    param([string] $PackagePath)
    $script:rollbackPackageSeen = $PackagePath
  }
  try {
    Restore-UpdateDeployment `
      -Plan $advancePlan `
      -PreviousDesiredState "stopped" `
      -RollbackPackage "previous-package.tgz" `
      -SetupBackup $rollbackSetupBackup `
      -RecoveryBackup $rollbackRecoveryBackup `
      -HadRecovery $true
  }
  finally {
    Remove-Item function:Install-BuiltDevSpacePackage -ErrorAction SilentlyContinue
    Remove-Item function:Stop-DevSpaceRuntime -ErrorAction SilentlyContinue
    . ([ScriptBlock]::Create((Get-SetupFunctionSource -Names @("Stop-DevSpaceRuntime"))))
  }
  $rolledBackHead = Invoke-CapturedChecked -FilePath "git.exe" -Arguments @(
    "-C", $gitManaged, "rev-parse", "HEAD^{commit}"
  )
  Assert-True `
    -Condition ($rolledBackHead -eq [string] $advancePlan.FromCommit) `
    -Message "Injected deployment rollback did not restore the previous Git commit."
  Assert-True -Condition $script:rollbackStopSeen -Message "Rollback did not stop the candidate runtime."
  Assert-True `
    -Condition ($script:rollbackPackageSeen -eq "previous-package.tgz") `
    -Message "Rollback did not reinstall the previous package."
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedScriptPath -Raw) -eq "previous setup") `
    -Message "Rollback did not restore the previous managed setup script."
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedRecoveryPath -Raw) -eq "previous recovery") `
    -Message "Rollback did not restore the previous managed recovery script."
  Assert-True `
    -Condition ((Read-JsonFile -Path $script:SettingsPath).desiredState -eq "stopped") `
    -Message "Rollback changed an intentionally stopped installation to running."

  $sharedLogPath = Join-Path $temporaryRoot "shared.log"
  $sharedLog = [System.IO.File]::Open(
    $sharedLogPath,
    [System.IO.FileMode]::Create,
    [System.IO.FileAccess]::Write,
    [System.IO.FileShare]::ReadWrite
  )
  try {
    $sharedBytes = [System.Text.Encoding]::UTF8.GetBytes("shared tunnel log")
    $sharedLog.Write($sharedBytes, 0, $sharedBytes.Length)
    $sharedLog.Flush()
    Assert-True `
      -Condition ((Read-Utf8TextShared -Path $sharedLogPath) -eq "shared tunnel log") `
      -Message "Shared UTF-8 log could not be read while its writer remained open."
  }
  finally {
    $sharedLog.Dispose()
  }

  $originalUserProfile = $env:USERPROFILE
  $script:LogDir = Join-Path $temporaryRoot "quick-tunnel-logs"
  $script:quickTunnelTestProcess = $null
  function Get-CommandPath {
    return "mock-cloudflared.exe"
  }
  function Start-Process {
    param(
      [string] $FilePath,
      [object[]] $ArgumentList,
      [string] $WindowStyle,
      [string] $RedirectStandardOutput,
      [string] $RedirectStandardError,
      [switch] $PassThru
    )
    [System.IO.File]::WriteAllText($RedirectStandardOutput, "trigger shared-log read")
    $script:quickTunnelTestProcess = Microsoft.PowerShell.Management\Start-Process `
      -FilePath "powershell.exe" `
      -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 60") `
      -WindowStyle Hidden `
      -PassThru
    return $script:quickTunnelTestProcess
  }
  function Read-Utf8TextShared {
    throw "injected shared-log read failure"
  }
  try {
    $env:USERPROFILE = $temporaryRoot
    $quickTunnelFailed = $false
    try {
      Start-QuickTunnel -LocalPort 7676 | Out-Null
    }
    catch {
      $quickTunnelFailed = $_.Exception.Message.Contains("injected shared-log read failure")
    }
    Assert-True -Condition $quickTunnelFailed -Message "Injected Quick Tunnel read failure was not observed."
    Assert-True `
      -Condition (-not [bool](Get-Process -Id $script:quickTunnelTestProcess.Id -ErrorAction SilentlyContinue)) `
      -Message "Quick Tunnel process survived an exceptional log-read exit."
  }
  finally {
    $env:USERPROFILE = $originalUserProfile
    if (
      $script:quickTunnelTestProcess -and
      (Get-Process -Id $script:quickTunnelTestProcess.Id -ErrorAction SilentlyContinue)
    ) {
      Stop-Process -Id $script:quickTunnelTestProcess.Id -Force
    }
    Remove-Item function:Start-Process -ErrorAction SilentlyContinue
    Remove-Item function:Get-CommandPath -ErrorAction SilentlyContinue
    . ([ScriptBlock]::Create(
        (Get-SetupFunctionSource -Names @("Get-CommandPath", "Read-Utf8TextShared"))
      ))
  }

  $tokensSeen = @{}
  for ($index = 0; $index -lt 32; $index += 1) {
    $ownerToken = New-OwnerToken
    Assert-True -Condition ($ownerToken.Length -ge 40) -Message "Owner token is too short."
    Assert-True -Condition ($ownerToken -match "^[A-Za-z0-9_-]+$") -Message "Owner token is not base64url."
    Assert-True -Condition (-not $tokensSeen.ContainsKey($ownerToken)) -Message "Owner token was repeated."
    $tokensSeen[$ownerToken] = $true
  }

  $origin = Normalize-HttpsOrigin -Value "https://example.com/"
  Assert-True -Condition ($origin -eq "https://example.com") -Message "HTTPS origin normalization failed."
  $httpRejected = $false
  try {
    Normalize-HttpsOrigin -Value "http://example.com" | Out-Null
  }
  catch {
    $httpRejected = $true
  }
  Assert-True -Condition $httpRejected -Message "HTTP public origin was not rejected."

  $script:capturedOAuthHeaders = $null
  $script:capturedOAuthTimeout = $null
  function Invoke-WebRequest {
    param(
      [switch] $UseBasicParsing,
      [string] $Uri,
      [hashtable] $Headers,
      [int] $TimeoutSec
    )
    $script:capturedOAuthHeaders = $Headers
    $script:capturedOAuthTimeout = $TimeoutSec
    return [pscustomobject]@{
      StatusCode = 200
      Content = '{"authorization_endpoint":"https://example.com/authorize","token_endpoint":"https://example.com/token"}'
    }
  }
  try {
    Test-OAuthMetadata -Origin "https://example.com"
  }
  finally {
    Remove-Item function:Invoke-WebRequest -ErrorAction SilentlyContinue
  }
  Assert-True `
    -Condition ($script:capturedOAuthHeaders["User-Agent"] -eq "DevSpace-Windows-Setup/1.0") `
    -Message "Public metadata verification did not use the setup API user agent."
  Assert-True `
    -Condition ($script:capturedOAuthTimeout -eq 10) `
    -Message "Public metadata verification is not bounded."

  $toml = ConvertTo-TomlBasicString -Value "C:\Program Files\node.exe"
  Assert-True `
    -Condition ($toml -eq '"C:\\Program Files\\node.exe"') `
    -Message "TOML path escaping failed: $toml"

  $currentUserPath = "C:\\Users\\" + [regex]::Escape([Environment]::UserName)
  Assert-True `
    -Condition ($sourceText -notmatch $currentUserPath) `
    -Message "Setup script contains the current machine's user-profile path."
  Assert-True `
    -Condition ($sourceText -notmatch "https://[a-z0-9-]{6,}\.trycloudflare\.com") `
    -Message "Setup script contains a concrete Quick Tunnel hostname."
  Assert-True `
    -Condition ($sourceText -notmatch "Register-ScheduledTask|schtasks(?:\.exe)?\s+/create") `
    -Message "Setup script unexpectedly registers automatic startup."
  Assert-True `
    -Condition ($sourceText.Contains('@($conflictingConfigs).Count')) `
    -Message "Quick Tunnel config discovery is not safe for zero matches under Strict Mode."
  $unmanagedCheckIndex = $sourceText.IndexOf(
    "An unmanaged [mcp_servers.playwright] section already exists"
  )
  $playwrightWriteIndex = $sourceText.IndexOf('name = "codex-playwright-mcp-runtime"')
  Assert-True `
    -Condition (
      $unmanagedCheckIndex -ge 0 -and
      $playwrightWriteIndex -ge 0 -and
      $unmanagedCheckIndex -lt $playwrightWriteIndex
    ) `
    -Message "Unmanaged Playwright config is not checked before runtime writes."
  $mainInstallIndex = $sourceText.LastIndexOf("Install-PreparedDevSpace -PackagePath `$preparedInstallation.PackagePath")
  $mainStopIndex = $sourceText.LastIndexOf("Stop-DevSpaceRuntime", $mainInstallIndex)
  $mainPrepareIndex = $sourceText.LastIndexOf("New-PreparedDevSpacePackage -Root `$resolvedSourceRoot")
  Assert-True `
    -Condition (
      $mainPrepareIndex -ge 0 -and
      $mainPrepareIndex -lt $mainStopIndex -and
      $mainStopIndex -lt $mainInstallIndex
    ) `
    -Message "Install mode does not finish fallible source preparation before stopping the runtime."
  Assert-True `
    -Condition $sourceText.Contains('"--allow-scripts=@waishnav/devspace"') `
    -Message "Global DevSpace install does not explicitly allow its reviewed postinstall repairs."
  Assert-True `
    -Condition (
      $sourceText.Contains('New-DevSpacePackage -Root $Root -Destination $packageRoot') -and
      -not $sourceText.Contains('"--allow-scripts=@waishnav/devspace",`r`n      "."')
    ) `
    -Message "Install mode links the global runtime to the mutable source checkout."
  Assert-True `
    -Condition (
      $sourceText.Contains('"ci",') -and
      $sourceText.Contains('"--omit=dev",') -and
      $sourceText.Contains('npm-shrinkwrap.json')
    ) `
    -Message "Installed runtime dependencies are not restored from the verified lock."
  Assert-True `
    -Condition ($sourceText.Contains("RecoveryStart") -and $sourceText.Contains("-ForceRestart")) `
    -Message "Recovery start recheck or explicit install restart is missing."
  Assert-True `
    -Condition (
      $sourceText.Contains('ValidateSet("Install", "Start", "Stop", "Plan", "Update", "LaunchUpdate")')
    ) `
    -Message "Portable setup does not expose Update mode."
  $preflightIndex = $sourceText.IndexOf("Invoke-UpdatePreflight -Root `$worktreePath")
  $updateStopIndex = $sourceText.IndexOf("Stop-DevSpaceRuntime", $preflightIndex)
  Assert-True `
    -Condition ($preflightIndex -ge 0 -and $updateStopIndex -gt $preflightIndex) `
    -Message "Update can stop the current runtime before candidate preflight."
  $updateRuntimeMutexIndex = $sourceText.IndexOf(
    "`$runtimeMutex = Enter-RuntimeOperation",
    $preflightIndex
  )
  $settingsRereadIndex = $sourceText.IndexOf(
    "`$settings = Read-JsonFile -Path `$script:SettingsPath",
    $updateRuntimeMutexIndex
  )
  $desiredStateIndex = $sourceText.IndexOf(
    "`$previousDesiredState = Get-DesiredRuntimeState -Settings `$settings",
    $settingsRereadIndex
  )
  Assert-True `
    -Condition (
      $updateRuntimeMutexIndex -gt $preflightIndex -and
      $settingsRereadIndex -gt $updateRuntimeMutexIndex -and
      $desiredStateIndex -gt $settingsRereadIndex
    ) `
    -Message "Update does not re-read desired runtime state after candidate preflight."
  Assert-True `
    -Condition (
      $sourceText.Contains('"merge", "--ff-only"') -and
      $sourceText.Contains('"reset", "--hard"') -and
      $sourceText.Contains('"rolled_back"')
    ) `
    -Message "Update fast-forward or rollback contract is incomplete."
  Assert-True `
    -Condition (
      $sourceText.Contains('Install-BuiltDevSpacePackage -PackagePath $candidatePackage') -and
      -not $sourceText.Contains('Install-BuiltDevSpacePackage -PackagePath $worktreePath')
    ) `
    -Message "Update installation is linked to its disposable candidate worktree."
  Assert-True `
    -Condition ($sourceText.Contains('New-InstalledDevSpaceRollbackPackage -Destination $backupPath')) `
    -Message "Update rollback does not capture the exact installed runtime."
  Assert-True `
    -Condition ($sourceText.Contains('& $taskkill /PID $ProcessId /T /F')) `
    -Message "Managed Stop does not terminate owned descendant processes."
  Assert-True `
    -Condition ($sourceText.Contains('if (-not $runtime.Reused)')) `
    -Message "Start failure can stop a pre-existing healthy runtime."
  Assert-True `
    -Condition ($sourceText.Contains('-SourcePath (Join-Path $resolvedSourceRoot "scripts\setup-windows-recovery.ps1")')) `
    -Message "Install mode does not refresh the managed recovery script."
  Assert-True `
    -Condition (
      $sourceText.Contains('if ($Mode -eq "LaunchUpdate")') -and
      $sourceText.Contains('-WindowStyle Hidden') -and
      $sourceText.Contains('windows-update.out.log') -and
      $sourceText.Contains('windows-update.err.log')
    ) `
    -Message "The hidden update launcher or bounded update logs are missing."

  $planOutput = & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $setupPath `
    -Mode Plan `
    -SourceRoot (Split-Path -Parent $PSScriptRoot) `
    -AllowedRoot (Split-Path -Parent $PSScriptRoot) 2>&1 | Out-String
  Assert-True -Condition ($LASTEXITCODE -eq 0) -Message "Plan mode failed: $planOutput"
  Assert-True -Condition ($planOutput.Contains("AutomaticStartup")) -Message "Plan omitted startup policy."
  Assert-True -Condition ($planOutput.Contains("no token copied or printed")) -Message "Plan omitted credential policy."

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $invalidOutput = & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $setupPath `
      -Mode Plan `
      -SourceRoot (Split-Path -Parent $PSScriptRoot) `
      -AllowedRoot (Split-Path -Parent $PSScriptRoot) `
      -TunnelMode External 2>&1 | Out-String
    $invalidExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  Assert-True -Condition ($invalidExitCode -ne 0) -Message "External mode accepted a missing public URL."
  Assert-True `
    -Condition ($invalidOutput.Contains("-PublicBaseUrl is required")) `
    -Message "External mode returned an unclear missing-URL error."

  $ownedProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 60") `
    -WindowStyle Hidden `
    -PassThru
  try {
    $ownedRecord = Get-CimInstance Win32_Process -Filter "ProcessId = $($ownedProcess.Id)"
    Write-JsonAtomic -Path $script:RuntimeStatePath -Value ([ordered]@{
        schema = "devspace-windows-runtime/v2"
        devspacePid = $ownedProcess.Id
        devspaceExecutablePath = [string] $ownedRecord.ExecutablePath
        devspaceCommandFragment = "Start-Sleep"
        devspaceStartTimeFileTimeUtc = $ownedProcess.StartTime.ToUniversalTime().ToFileTimeUtc()
        cloudflaredPid = $null
      })
    Stop-DevSpaceRuntime
    Assert-True `
      -Condition (-not [bool](Get-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue)) `
      -Message "Owned process was not stopped."
    Assert-True `
      -Condition (-not (Test-Path -LiteralPath $script:RuntimeStatePath)) `
      -Message "Owned runtime state was not removed."
  }
  finally {
    if (Get-Process -Id $ownedProcess.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $ownedProcess.Id -Force
    }
  }

  $unownedProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 60") `
    -WindowStyle Hidden `
    -PassThru
  try {
    Write-JsonAtomic -Path $script:RuntimeStatePath -Value ([ordered]@{
        schema = "devspace-windows-runtime/v2"
        devspacePid = $unownedProcess.Id
        devspaceExecutablePath = "C:\wrong-process.exe"
        devspaceCommandFragment = "wrong-command"
        devspaceStartTimeFileTimeUtc = 1
        cloudflaredPid = $null
      })
    $identityRejected = $false
    try {
      Stop-DevSpaceRuntime
    }
    catch {
      $identityRejected = $true
    }
    Assert-True -Condition $identityRejected -Message "Mismatched process identity was accepted."
    Assert-True `
      -Condition ([bool](Get-Process -Id $unownedProcess.Id -ErrorAction SilentlyContinue)) `
      -Message "Mismatched process was stopped."
    Assert-True `
      -Condition (Test-Path -LiteralPath $script:RuntimeStatePath) `
      -Message "Mismatched runtime state was discarded."
  }
  finally {
    if (Get-Process -Id $unownedProcess.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $unownedProcess.Id -Force
    }
    if (Test-Path -LiteralPath $script:RuntimeStatePath) {
      Remove-Item -LiteralPath $script:RuntimeStatePath -Force
    }
  }
}
finally {
  if (Test-Path -LiteralPath $temporaryRoot) {
    Remove-Item -LiteralPath $temporaryRoot -Recurse -Force
  }
}

Write-Host "setup-windows tests: pass"
