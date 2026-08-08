#requires -Version 5.1

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$setupPath = Join-Path $PSScriptRoot "setup-windows.ps1"
$sourceText = Get-Content -LiteralPath $setupPath -Raw
$packageJsonPath = Join-Path (Split-Path -Parent $PSScriptRoot) "package.json"
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
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
        "Invoke-CheckedParallel",
        "Get-CleanSourceCommit",
        "Throw-UpdateFailure",
        "Get-UpdateFailureCode",
        "Get-SourceUpdatePlan",
        "New-UpdateTemporaryRoot",
        "Remove-UpdateTemporaryRoot",
        "Remove-UpdateWorktree",
        "Get-SourceUpdatePlanWithoutFetch",
        "Assert-UpdatePlanStillCurrent",
        "Test-InstalledRuntimeMatchesTarget",
        "Restore-UpdateDeployment",
        "Invoke-RestoredManagedStart",
        "Get-GlobalNpmRoot",
        "Get-GlobalNpmPrefix",
        "Get-InstalledDevSpaceRoot",
        "Get-ExtendedLengthPath",
        "Remove-DirectoryTreeLongPath",
        "Get-Sha256",
        "Assert-DevSpaceRuntimeBinContract",
        "Assert-DevSpaceGlobalBinShims",
        "Install-PreparedDevSpaceRuntime",
        "Get-RuntimePackagePath",
        "Save-RuntimePackageCache",
        "Get-ValidatedRuntimePackage",
        "Set-RuntimeRecoveryState",
        "Ensure-RuntimeRecoveryState",
        "Repair-InstalledDevSpaceRuntime",
        "Get-UriOrigin",
        "Assert-UriUsesOrigin",
        "Test-OAuthMetadata",
        "Test-CodexDelegationAdvisoryFailure",
        "New-OwnerToken",
        "ConvertTo-TomlBasicString",
        "Get-ProcessRecord",
        "Get-TrackedProcessIdentity",
        "Invoke-TaskkillProcessTree",
        "Test-TrackedProcessGenerationExists",
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
  $parallelWorkingDirectory = Join-Path $temporaryRoot "parallel-check"
  New-Item -ItemType Directory -Path $parallelWorkingDirectory | Out-Null
  Invoke-CheckedParallel -WorkingDirectory $parallelWorkingDirectory -Commands @(
    [pscustomobject]@{ Name = "first"; CommandLine = "where.exe cmd.exe" },
    [pscustomobject]@{ Name = "second"; CommandLine = "where.exe powershell.exe" }
  )
  $parallelFailure = $null
  try {
    Invoke-CheckedParallel -WorkingDirectory $parallelWorkingDirectory -Commands @(
      [pscustomobject]@{
        Name = "expected-failure"
        CommandLine = "where.exe definitely-missing-dpkr-helix-command"
      }
    )
  }
  catch {
    $parallelFailure = $_.Exception.Message
  }
  Assert-True `
    -Condition ($parallelFailure -and $parallelFailure.Contains("expected-failure (1)")) `
    -Message "Parallel candidate verification did not preserve a failing command's identity and exit code."
  $missingResultFailure = $null
  try {
    Invoke-CheckedParallel -WorkingDirectory $parallelWorkingDirectory -Commands @(
      [pscustomobject]@{ Name = "missing-result"; CommandLine = "exit /b 0" }
    )
  }
  catch {
    $missingResultFailure = $_.Exception.Message
  }
  Assert-True `
    -Condition ($missingResultFailure -and $missingResultFailure.Contains("missing-result (255)")) `
    -Message "Parallel candidate verification did not fail closed when its result sidecar was absent."

  $swapPrefix = Join-Path $temporaryRoot "swap-prefix"
  $installedRuntime = Join-Path $swapPrefix "node_modules\@waishnav\devspace"
  $preparedRuntime = Join-Path $temporaryRoot "prepared-runtime"
  $runtimeBackup = Join-Path $temporaryRoot "runtime-backup"
  foreach ($rootAndMarker in @(
      @($installedRuntime, "previous", ("p" * 64)),
      @($preparedRuntime, "candidate", ("c" * 64))
    )) {
    New-Item -ItemType Directory -Path (Join-Path $rootAndMarker[0] "dist") -Force | Out-Null
    Write-Utf8NoBom -Path (Join-Path $rootAndMarker[0] "package.json") -Content (
      '{"name":"@waishnav/devspace","bin":{"devspace":"dist/cli.js","helix":"dist/helix-cli.js"}}'
    )
    Write-Utf8NoBom -Path (Join-Path $rootAndMarker[0] "dist\cli.js") -Content $rootAndMarker[1]
    Write-Utf8NoBom -Path (Join-Path $rootAndMarker[0] "dist\helix-cli.js") -Content $rootAndMarker[1]
    Write-Utf8NoBom -Path (Join-Path $rootAndMarker[0] "fingerprint.txt") -Content $rootAndMarker[2]
  }
  foreach ($name in @("devspace", "helix")) {
    foreach ($suffix in @("", ".cmd", ".ps1")) {
      Write-Utf8NoBom -Path (Join-Path $swapPrefix ($name + $suffix)) -Content "shim"
    }
  }
  $previousPrefix = $env:npm_config_prefix
  try {
    $env:npm_config_prefix = $swapPrefix
    $installedFingerprint = & {
      function Get-DevSpaceRuntimeFingerprint {
        param([string] $Root)
        return (Get-Content -LiteralPath (Join-Path $Root "fingerprint.txt") -Raw)
      }
      function Get-InstalledDevSpaceRuntimeFingerprint {
        return Get-DevSpaceRuntimeFingerprint -Root (Get-InstalledDevSpaceRoot)
      }
      Install-PreparedDevSpaceRuntime `
        -PreparedRoot $preparedRuntime `
        -ExpectedFingerprint ("c" * 64) `
        -BackupRoot $runtimeBackup
    }
  }
  finally {
    $env:npm_config_prefix = $previousPrefix
  }
  Assert-True `
    -Condition (
      $installedFingerprint -eq ("c" * 64) -and
      (Get-Content -LiteralPath (Join-Path $installedRuntime "dist\cli.js") -Raw) -eq "candidate" -and
      (Get-Content -LiteralPath (Join-Path $runtimeBackup "dist\cli.js") -Raw) -eq "previous" -and
      -not (Test-Path -LiteralPath $preparedRuntime)
    ) `
    -Message "Prepared runtime replacement did not preserve the previous generation and install the candidate."

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
  $deploymentState = Set-RuntimeRecoveryState `
    -PackageHash ("a" * 64) `
    -RuntimeFingerprint ("b" * 64) `
    -SourceCommit ("c" * 40)
  Assert-True `
    -Condition ([string] $deploymentState.runtimeSourceCommit -eq ("c" * 40)) `
    -Message "Runtime source commit was not persisted with deployment state."
  $preservedDeploymentState = Set-RuntimeRecoveryState `
    -PackageHash ("d" * 64) `
    -RuntimeFingerprint ("e" * 64)
  Assert-True `
    -Condition ([string] $preservedDeploymentState.runtimeSourceCommit -eq ("c" * 40)) `
    -Message "A recovery-state refresh discarded the recorded runtime source commit."
  $invalidSourceCommitRejected = $false
  try {
    Set-RuntimeRecoveryState `
      -PackageHash ("f" * 64) `
      -RuntimeFingerprint ("0" * 64) `
      -SourceCommit "not-a-commit" | Out-Null
  }
  catch {
    $invalidSourceCommitRejected = $_.Exception.Message.Contains("source commit")
  }
  Assert-True `
    -Condition $invalidSourceCommitRejected `
    -Message "An invalid runtime source commit was accepted."

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
  $cleanupLongPathDirectory = $updateTemporaryRoot
  foreach ($index in 1..4) {
    $cleanupLongPathDirectory = Join-Path $cleanupLongPathDirectory (
      ("cleanup-segment-{0}-" -f $index) + ("x" * 56)
    )
  }
  $cleanupLongPathFile = Join-Path $cleanupLongPathDirectory "getRecursionDetectionPlugin.browser.js"
  [System.IO.Directory]::CreateDirectory(
    (Get-ExtendedLengthPath -Path $cleanupLongPathDirectory)
  ) | Out-Null
  [System.IO.File]::WriteAllText(
    (Get-ExtendedLengthPath -Path $cleanupLongPathFile),
    "long update cleanup fixture"
  )
  Remove-UpdateTemporaryRoot -Path $updateTemporaryRoot
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $updateTemporaryRoot)) `
    -Message "Validated update temporary root with long descendant paths was not removed."

  $worktreeCleanupRoot = Join-Path $temporaryRoot "worktree-cleanup"
  $worktreeNodeModules = Join-Path $worktreeCleanupRoot "node_modules"
  New-Item -ItemType Directory -Path $worktreeNodeModules -Force | Out-Null
  [System.IO.File]::WriteAllText(
    (Join-Path $worktreeNodeModules "fixture.txt"),
    "fixture"
  )
  $script:worktreeCleanupObserved = $false
  & {
    function Invoke-Checked {
      param([string] $FilePath, [string[]] $Arguments)
      $script:worktreeCleanupObserved = -not (
        [System.IO.Directory]::Exists(
          (Get-ExtendedLengthPath -Path $worktreeNodeModules)
        )
      )
    }
    Remove-UpdateWorktree `
      -Plan ([pscustomobject]@{ Git = "git.exe"; Root = $temporaryRoot }) `
      -Path $worktreeCleanupRoot
  }
  Assert-True `
    -Condition $script:worktreeCleanupObserved `
    -Message "Update worktree removal did not delete node_modules before Git cleanup."
  Remove-DirectoryTreeLongPath -Path $worktreeCleanupRoot

  Assert-True `
    -Condition (Test-CodexDelegationAdvisoryFailure -Result (
        "agt_fixture error codex-explorer codex model thinking=max failure=rate_limited"
      )) `
    -Message "Explicit Codex usage exhaustion was not classified as advisory."
  Assert-True `
    -Condition (Test-CodexDelegationAdvisoryFailure -Result (
        "agt_fixture error codex-explorer codex model thinking=max`n" +
        "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage " +
        "to purchase more credits."
      )) `
    -Message "Codex usage exhaustion without the structured failure marker was not classified as advisory."
  Assert-True `
    -Condition (-not (Test-CodexDelegationAdvisoryFailure -Result (
          "agt_fixture error codex-explorer codex model thinking=max failure=tool_failed"
        ))) `
    -Message "A candidate delegation defect was incorrectly classified as an external quota outage."

  $script:RuntimePackageDir = Join-Path $temporaryRoot "runtime-packages"
  $runtimePackageSource = Join-Path $temporaryRoot "runtime-package.tgz"
  [System.IO.File]::WriteAllText($runtimePackageSource, "verified runtime package")
  $savedNpmPrefix = $env:npm_config_prefix
  $unicodeNpmPrefix = Join-Path $temporaryRoot (
    "npm prefix " + [string]([char] 0x6625)
  )
  try {
    $env:npm_config_prefix = $unicodeNpmPrefix
    Assert-True `
      -Condition ((Get-GlobalNpmPrefix) -eq [System.IO.Path]::GetFullPath($unicodeNpmPrefix)) `
      -Message "The exact Unicode npm_config_prefix was not preserved."
    Assert-True `
      -Condition ((Get-GlobalNpmRoot) -eq (Join-Path ([System.IO.Path]::GetFullPath($unicodeNpmPrefix)) "node_modules")) `
      -Message "The global npm root was not derived from the exact configured prefix."
  }
  finally {
    $env:npm_config_prefix = $savedNpmPrefix
  }
  Assert-True `
    -Condition ((Get-ExtendedLengthPath -Path $runtimePackageSource).StartsWith("\\?\")) `
    -Message "Long-path normalization did not produce an extended Windows path."
  $longPathRoot = Join-Path $temporaryRoot "long-path-hash"
  $longPathDirectory = $longPathRoot
  foreach ($index in 1..4) {
    $longPathDirectory = Join-Path $longPathDirectory (
      ("segment-{0}-" -f $index) + ("x" * 56)
    )
  }
  $longPathFile = Join-Path $longPathDirectory "runtime-integrity-payload.txt"
  Assert-True `
    -Condition ($longPathFile.Length -gt 260) `
    -Message "Long-path hash fixture did not exceed the legacy Windows path limit."
  [System.IO.Directory]::CreateDirectory(
    (Get-ExtendedLengthPath -Path $longPathDirectory)
  ) | Out-Null
  [System.IO.File]::WriteAllText(
    (Get-ExtendedLengthPath -Path $longPathFile),
    "verified runtime package"
  )
  Assert-True `
    -Condition ((Get-Sha256 -Path $longPathFile) -eq (Get-Sha256 -Path $runtimePackageSource)) `
    -Message "Runtime hashing failed beyond the legacy Windows path limit."
  [System.IO.Directory]::Delete(
    (Get-ExtendedLengthPath -Path $longPathRoot),
    $true
  )
  $cachedRuntimePackage = Save-RuntimePackageCache -PackagePath $runtimePackageSource
  Assert-True `
    -Condition (([string] $cachedRuntimePackage.Hash) -match "^[0-9a-f]{64}$") `
    -Message "Runtime recovery package hash is invalid."
  Assert-True `
    -Condition (Test-Path -LiteralPath $cachedRuntimePackage.Path -PathType Leaf) `
    -Message "Runtime recovery package was not retained."
  $runtimePackageSettings = [pscustomobject]@{
    runtimePackageSha256 = [string] $cachedRuntimePackage.Hash
  }
  $validatedRuntimePackage = Get-ValidatedRuntimePackage -Settings $runtimePackageSettings
  Assert-True `
    -Condition ($validatedRuntimePackage.Path -eq $cachedRuntimePackage.Path) `
    -Message "Recorded runtime recovery package did not validate."
  [System.IO.File]::WriteAllText($cachedRuntimePackage.Path, "corrupt")
  $corruptRuntimePackageRejected = $false
  try {
    Get-ValidatedRuntimePackage -Settings $runtimePackageSettings | Out-Null
  }
  catch {
    $corruptRuntimePackageRejected = $_.Exception.Message.Contains("corrupt")
  }
  Assert-True `
    -Condition $corruptRuntimePackageRejected `
    -Message "A corrupt runtime recovery package was accepted."
  $repairedRuntimePackage = Save-RuntimePackageCache -PackagePath $runtimePackageSource
  Assert-True `
    -Condition ((Get-Sha256 -Path $repairedRuntimePackage.Path) -eq $repairedRuntimePackage.Hash) `
    -Message "A corrupt cached package was not repaired atomically."
  $repairOutput = @(& {
      function Install-BuiltDevSpacePackage {
        param([string] $PackagePath)
        "npm progress that must not escape"
      }
      function Get-InstalledDevSpaceRuntimeFingerprint {
        return "c" * 64
      }
      function Set-RuntimeRecoveryState {
        param([string] $PackageHash, [string] $RuntimeFingerprint)
        return [pscustomobject]@{
          port = 17676
          runtimePackageSha256 = $PackageHash
          runtimeFingerprint = $RuntimeFingerprint
        }
      }
      Repair-InstalledDevSpaceRuntime -RecoveryState ([pscustomobject]@{
          PackagePath = $runtimePackageSource
          PackageHash = "d" * 64
          ExpectedFingerprint = "c" * 64
        })
    })
  Assert-True `
    -Condition ($repairOutput.Count -eq 1 -and [int] $repairOutput[0].port -eq 17676) `
    -Message "Runtime repair leaked installer output into the returned settings object."
  $untrustedRecacheRejected = & {
    function Get-ValidatedRuntimePackage {
      param($Settings)
      throw "managed recovery package is corrupt"
    }
    function Get-InstalledDevSpaceRuntimeStatus {
      return [pscustomobject]@{
        Complete = $true
        Fingerprint = "f" * 64
        Failure = $null
      }
    }
    function New-UpdateTemporaryRoot {
      throw "recache must not be reached"
    }
    try {
      Ensure-RuntimeRecoveryState -Settings ([pscustomobject]@{
          runtimePackageSha256 = "a" * 64
          runtimeFingerprint = "e" * 64
        }) | Out-Null
      return $false
    }
    catch {
      return (
        $_.Exception.Message.Contains("Refusing to trust either copy automatically") -and
        -not $_.Exception.Message.Contains("recache must not be reached")
      )
    }
  }
  Assert-True `
    -Condition $untrustedRecacheRejected `
    -Message "A damaged recovery package caused a mismatched installed runtime to be trusted again."

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
  Assert-True `
    -Condition ((Get-CleanSourceCommit -Root $gitManaged) -eq $samePlan.FromCommit) `
    -Message "A clean source checkout did not expose its exact commit."
  $matchingInstalledRuntime = & {
    function Get-InstalledDevSpaceRuntimeStatus {
      return [pscustomobject]@{
        Complete = $true
        Fingerprint = "a" * 64
        Failure = $null
      }
    }
    Test-InstalledRuntimeMatchesTarget `
      -Settings ([pscustomobject]@{
          runtimeSourceCommit = [string] $samePlan.TargetCommit
          runtimeFingerprint = "a" * 64
        }) `
      -TargetCommit ([string] $samePlan.TargetCommit)
  }
  Assert-True `
    -Condition $matchingInstalledRuntime `
    -Message "A matching installed runtime was not recognized as current."
  $missingInstalledCommitIsCurrent = & {
    function Get-InstalledDevSpaceRuntimeStatus {
      return [pscustomobject]@{
        Complete = $true
        Fingerprint = "a" * 64
        Failure = $null
      }
    }
    Test-InstalledRuntimeMatchesTarget `
      -Settings ([pscustomobject]@{ runtimeFingerprint = "a" * 64 }) `
      -TargetCommit ([string] $samePlan.TargetCommit)
  }
  Assert-True `
    -Condition (-not $missingInstalledCommitIsCurrent) `
    -Message "An installation without commit provenance was incorrectly treated as current."
  $mismatchedInstalledRuntimeIsCurrent = & {
    function Get-InstalledDevSpaceRuntimeStatus {
      return [pscustomobject]@{
        Complete = $true
        Fingerprint = "b" * 64
        Failure = $null
      }
    }
    Test-InstalledRuntimeMatchesTarget `
      -Settings ([pscustomobject]@{
          runtimeSourceCommit = [string] $samePlan.TargetCommit
          runtimeFingerprint = "a" * 64
        }) `
      -TargetCommit ([string] $samePlan.TargetCommit)
  }
  Assert-True `
    -Condition (-not $mismatchedInstalledRuntimeIsCurrent) `
    -Message "A mismatched installed runtime fingerprint was treated as current."

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
  Assert-True `
    -Condition (-not (Get-CleanSourceCommit -Root $gitManaged)) `
    -Message "A dirty source checkout was assigned a deployment commit."
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
  $rollbackSettingsBackup = Join-Path $temporaryRoot "rollback-settings.json"
  $rollbackInstalledRoot = Join-Path $temporaryRoot "rollback-installed"
  $rollbackInstalledScripts = Join-Path $rollbackInstalledRoot "scripts"
  New-Item -ItemType Directory -Path $rollbackInstalledScripts -Force | Out-Null
  $script:ManagedScriptPath = Join-Path $temporaryRoot "managed-restore\setup-windows.ps1"
  $script:ManagedRecoveryPath = Join-Path $temporaryRoot "managed-restore\setup-windows-recovery.ps1"
  $script:SettingsPath = Join-Path $temporaryRoot "restore-settings.json"
  [System.IO.File]::WriteAllText($rollbackSetupBackup, "stale managed setup backup")
  [System.IO.File]::WriteAllText($rollbackRecoveryBackup, "stale managed recovery backup")
  [System.IO.File]::WriteAllText(
    (Join-Path $rollbackInstalledScripts "setup-windows.ps1"),
    "package-owned setup"
  )
  [System.IO.File]::WriteAllText(
    (Join-Path $rollbackInstalledScripts "setup-windows-recovery.ps1"),
    "package-owned recovery"
  )
  Write-JsonAtomic -Path $rollbackSettingsBackup -Value ([ordered]@{
      desiredState = "stopped"
      runtimePackageSha256 = "a" * 64
      runtimeFingerprint = "b" * 64
    })
  Write-JsonAtomic -Path $script:SettingsPath -Value ([ordered]@{ desiredState = "running" })
  $script:rollbackPackageSeen = $null
  $script:rollbackCompatibilityModeSeen = $false
  $script:rollbackStopSeen = $false
  function Stop-DevSpaceRuntime {
    $script:rollbackStopSeen = $true
  }
  function Install-BuiltDevSpacePackage {
    param(
      [string] $PackagePath,
      [switch] $SkipRuntimeFingerprintVerification
    )
    $script:rollbackPackageSeen = $PackagePath
    $script:rollbackCompatibilityModeSeen = [bool] $SkipRuntimeFingerprintVerification
  }
  function Get-InstalledDevSpaceRoot {
    return $rollbackInstalledRoot
  }
  try {
    Restore-UpdateDeployment `
      -Plan $advancePlan `
      -PreviousDesiredState "stopped" `
      -RollbackPackage "previous-package.tgz" `
      -SettingsBackup $rollbackSettingsBackup `
      -SetupBackup $rollbackSetupBackup `
      -RecoveryBackup $rollbackRecoveryBackup `
      -HadRecovery $true
  }
  finally {
    Remove-Item function:Install-BuiltDevSpacePackage -ErrorAction SilentlyContinue
    Remove-Item function:Get-InstalledDevSpaceRoot -ErrorAction SilentlyContinue
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
    -Condition $script:rollbackCompatibilityModeSeen `
    -Message "Rollback required the candidate generation's runtime fingerprint contract."
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedScriptPath -Raw) -eq "package-owned setup") `
    -Message "Rollback did not restore setup from the verified prior-generation package."
  Assert-True `
    -Condition ((Get-Content -LiteralPath $script:ManagedRecoveryPath -Raw) -eq "package-owned recovery") `
    -Message "Rollback did not restore recovery from the verified prior-generation package."
  Assert-True `
    -Condition ((Read-JsonFile -Path $script:SettingsPath).desiredState -eq "stopped") `
    -Message "Rollback changed an intentionally stopped installation to running."

  $script:restoredStartFile = $null
  $script:restoredStartArguments = @()
  & {
    function Get-CommandPath {
      param([string] $Name)
      return "powershell.exe"
    }
    function Invoke-Checked {
      param([string] $FilePath, [string[]] $Arguments)
      $script:restoredStartFile = $FilePath
      $script:restoredStartArguments = @($Arguments)
    }
    Invoke-RestoredManagedStart
  }
  Assert-True `
    -Condition ($script:restoredStartFile -eq "powershell.exe") `
    -Message "Rollback did not use Windows PowerShell to invoke the restored lifecycle owner."
  Assert-True `
    -Condition (
      $script:restoredStartArguments -contains $script:ManagedScriptPath -and
      $script:restoredStartArguments -contains "Start" -and
      $script:restoredStartArguments -contains "-RecoveryStart" -and
      $script:restoredStartArguments -contains "-SkipVerification"
    ) `
    -Message "Rollback did not restart through the restored managed setup script."

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
  $script:capturedOAuthUris = @()
  $script:staleOAuthOrigin = $false
  function Invoke-WebRequest {
    param(
      [switch] $UseBasicParsing,
      [string] $Uri,
      [hashtable] $Headers,
      [int] $TimeoutSec
    )
    $script:capturedOAuthHeaders = $Headers
    $script:capturedOAuthTimeout = $TimeoutSec
    $script:capturedOAuthUris += $Uri
    $advertisedOrigin = if ($script:staleOAuthOrigin) {
      "https://obsolete.trycloudflare.com"
    }
    else {
      "https://example.com"
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
          revocation_endpoint = "$advertisedOrigin/revoke"
        } | ConvertTo-Json -Compress)
    }
  }
  try {
    Test-OAuthMetadata `
      -Origin "http://127.0.0.1:17676" `
      -ExpectedPublicOrigin "https://example.com"
    $script:staleOAuthOrigin = $true
    $staleOAuthRejected = $false
    try {
      Test-OAuthMetadata `
        -Origin "http://127.0.0.1:17676" `
        -ExpectedPublicOrigin "https://example.com"
    }
    catch {
      $staleOAuthRejected = $_.Exception.Message.Contains("obsolete.trycloudflare.com")
    }
    Assert-True `
      -Condition $staleOAuthRejected `
      -Message "OAuth metadata advertising an obsolete Quick Tunnel origin was accepted."
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
  Assert-True `
    -Condition ((@(
          $script:capturedOAuthUris |
            Where-Object { $_ -match "oauth-protected-resource/mcp" }
        )).Count -gt 0) `
    -Message "Protected-resource metadata was not verified."

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
    -Condition (
      $sourceText.Contains('$globalPrefix = Get-GlobalNpmPrefix') -and
      $sourceText.Contains('"--prefix", $globalPrefix')
    ) `
    -Message "Global package deployment does not pass the resolved prefix explicitly to npm."
  Assert-True `
    -Condition (
      $sourceText.Contains('devspace-windows-runtime/v3') -and
      $sourceText.Contains('runtimePackageSha256') -and
      $sourceText.Contains('Repair-InstalledDevSpaceRuntime')
    ) `
    -Message "Runtime package attestation and repair are not wired into Start."
  Assert-True `
    -Condition $sourceText.Contains('/.well-known/oauth-protected-resource/mcp') `
    -Message "OAuth protected-resource metadata is not part of runtime verification."
  Assert-True `
    -Condition (
      $sourceText.Contains('scripts\setup-windows.test.ps1') -and
      $sourceText.Contains('scripts\setup-windows-recovery.test.ps1')
    ) `
    -Message "Managed update preflight omits Windows recovery regression suites."
  $hasPretest = $packageJson.scripts.PSObject.Properties.Name -contains "pretest"
  Assert-True `
    -Condition (-not $hasPretest) `
    -Message "Package tests still duplicate files through a separate pretest hook."
  Assert-True `
    -Condition (
      [string] $packageJson.scripts.test -eq
      'tsx --test --test-concurrency=4 "src/**/*.test.ts"'
    ) `
    -Message "Package tests do not run the complete test-file set through the bounded parallel runner."
  $preflightSource = Get-SetupFunctionSource -Names @("Invoke-UpdatePreflight")
  $preflightCiIndex = $preflightSource.IndexOf('"ci", "--include=dev", "--no-audit"')
  $parallelChecksIndex = $preflightSource.IndexOf("Invoke-CheckedParallel")
  $preflightBuildIndex = $preflightSource.IndexOf('"run", "build"')
  $preflightPublicIndex = $preflightSource.IndexOf('"run", "check:public"')
  Assert-True `
    -Condition (
      $preflightCiIndex -ge 0 -and
      $parallelChecksIndex -gt $preflightCiIndex -and
      $preflightBuildIndex -gt $parallelChecksIndex -and
      $preflightPublicIndex -gt $preflightBuildIndex
    ) `
    -Message "Managed update preflight does not isolate dependency install, parallel read-only checks, build, and public scan in the accepted order."
  foreach ($parallelCheck in @(
      'Name = "tests"',
      'Name = "typecheck"',
      'Name = "production-audit"',
      'Name = "windows-setup"',
      'Name = "windows-recovery"'
    )) {
    Assert-True `
      -Condition $preflightSource.Contains($parallelCheck) `
      -Message "Managed update parallel verification is missing: $parallelCheck"
  }
  $parallelFunctionSource = Get-SetupFunctionSource -Names @("Invoke-CheckedParallel")
  Assert-True `
    -Condition (
      $parallelFunctionSource.Contains("Start-Process") -and
      $parallelFunctionSource.Contains("RedirectStandardOutput") -and
      $parallelFunctionSource.Contains("RedirectStandardError") -and
      $parallelFunctionSource.Contains(".Refresh()") -and
      $parallelFunctionSource.Contains("Remove-DirectoryTreeLongPath")
    ) `
    -Message "Parallel candidate verification lacks bounded process output, exit-code refresh, or long-path cleanup."
  Assert-True `
    -Condition $sourceText.Contains('windows-bootstrap.previous.json') `
    -Message "Managed update rollback does not preserve bootstrap settings."
  Assert-True `
    -Condition (
      $sourceText.Contains('[switch] $SkipRuntimeFingerprintVerification') -and
      $sourceText.Contains('if (-not $SkipRuntimeFingerprintVerification)') -and
      $sourceText.Contains('-SkipRuntimeFingerprintVerification')
    ) `
    -Message "Rollback cannot install a prior package generation without applying the candidate fingerprint contract."
  Assert-True `
    -Condition (
      $sourceText.Contains('Invoke-RestoredManagedStart') -and
      $sourceText.Contains('Exit-RuntimeOperation -Mutex $runtimeMutex') -and
      $sourceText.Contains('$runtimeMutex = Enter-RuntimeOperation') -and
      $sourceText.Contains('Invoke-RestoredRuntimeVerification')
    ) `
    -Message "Rollback does not hand runtime ownership back to the restored setup generation."
  Assert-True `
    -Condition (
      $sourceText.Contains('$arguments += "-SkipVerification"') -and
      $sourceText.Contains('if ($SkipVerification)')
    ) `
    -Message "The detached update launcher drops the explicit verification-skip flag."
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
  $updateSource = Get-SetupFunctionSource -Names @("Invoke-UpdateMode")
  $prepareRuntimeIndex = $updateSource.IndexOf("New-PreparedDevSpaceRuntime")
  $runtimeLockIndex = $updateSource.IndexOf("`$runtimeMutex = Enter-RuntimeOperation")
  $stopRuntimeIndex = $updateSource.IndexOf("Stop-DevSpaceRuntime")
  $installPreparedIndex = $updateSource.IndexOf("Install-PreparedDevSpaceRuntime")
  Assert-True `
    -Condition (
      $prepareRuntimeIndex -ge 0 -and
      $runtimeLockIndex -gt $prepareRuntimeIndex -and
      $stopRuntimeIndex -gt $runtimeLockIndex -and
      $installPreparedIndex -gt $stopRuntimeIndex
    ) `
    -Message "Update does not prepare the locked runtime before downtime and swap it only after Stop."
  $runtimeSwapSource = Get-SetupFunctionSource -Names @("Install-PreparedDevSpaceRuntime")
  Assert-True `
    -Condition (
      $runtimeSwapSource.Contains("Assert-DevSpaceGlobalBinShims") -and
      $runtimeSwapSource.Contains("Move-Item -LiteralPath `$installedRoot -Destination `$backup") -and
      $runtimeSwapSource.Contains("Move-Item -LiteralPath `$prepared -Destination `$installedRoot") -and
      $runtimeSwapSource.Contains("Get-InstalledDevSpaceRuntimeFingerprint") -and
      $runtimeSwapSource.Contains("Immediate runtime replacement recovery failed")
    ) `
    -Message "Prepared runtime replacement lacks CLI preservation, fingerprint proof, or immediate physical recovery."
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
    -Condition (
      $sourceText.Contains('Invoke-TaskkillProcessTree') -and
      $sourceText.Contains('& $TaskkillPath /PID $ProcessId /T /F') -and
      $sourceText.Contains('Test-TrackedProcessGenerationExists')
    ) `
    -Message "Managed Stop does not terminate and verify the owned process generation."
  Assert-True `
    -Condition ($sourceText.Contains('if (-not $runtime.Reused)')) `
    -Message "Start failure can stop a pre-existing healthy runtime."
  Assert-True `
    -Condition ($sourceText.Contains('-SourcePath (Join-Path $resolvedSourceRoot "scripts\setup-windows-recovery.ps1")')) `
    -Message "Install mode does not refresh the managed recovery script."
  Assert-True `
    -Condition ($sourceText.Contains('$env:DEVSPACE_LOG_TOOL_CALLS = "0"')) `
    -Message "Managed runtime leaves high-volume successful tool logging enabled."
  Assert-True `
    -Condition ($sourceText.Contains('[string] $CodexModel = "gpt-5.6-sol"')) `
    -Message "Managed Codex default is not GPT-5.6 Sol."
  Assert-True `
    -Condition (
      $sourceText.Contains('model: gpt-5.6-luna') -and
      $sourceText.Contains('thinking: max') -and
      $sourceText.Contains('name: codex-implementer-high') -and
      $sourceText.Contains('name: codex-implementer-xhigh') -and
      $sourceText.Contains('thinking: xhigh')
    ) `
    -Message "Managed Luna max or Sol xhigh profile is missing."
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

  $taskkillFailurePath = Join-Path $temporaryRoot "taskkill-native-failure.cmd"
  [System.IO.File]::WriteAllText(
    $taskkillFailurePath,
    "@echo off`r`n>&2 echo ERROR: injected descendant race`r`nexit /b 128`r`n",
    [System.Text.Encoding]::ASCII
  )
  $nativeTermination = Invoke-TaskkillProcessTree `
    -TaskkillPath $taskkillFailurePath `
    -ProcessId 4242
  Assert-True `
    -Condition ([int] $nativeTermination.ExitCode -eq 128) `
    -Message "Native taskkill stderr escaped the bounded capture path."

  $taskkillRacePath = Join-Path $temporaryRoot "taskkill-descendant-race.cmd"
  [System.IO.File]::WriteAllText(
    $taskkillRacePath,
    (
      "@echo off`r`n" +
      '"%SystemRoot%\System32\taskkill.exe" /PID %2 /F >nul 2>&1' + "`r`n" +
      ">&2 echo ERROR: injected child process already exited`r`n" +
      "exit /b 128`r`n"
    ),
    [System.Text.Encoding]::ASCII
  )
  $raceProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 60") `
    -WindowStyle Hidden `
    -PassThru
  $originalGetCommandPath = (Get-Item function:Get-CommandPath).ScriptBlock
  $script:taskkillTestPath = $taskkillRacePath
  try {
    Set-Item function:Get-CommandPath -Value {
      param([string] $Name)
      if ($Name -eq "taskkill.exe") {
        return $script:taskkillTestPath
      }
      throw "Unexpected command lookup in taskkill race test: $Name"
    }
    $raceRecord = Get-CimInstance Win32_Process -Filter "ProcessId = $($raceProcess.Id)"
    $raceStopped = Stop-TrackedProcess `
      -ProcessId $raceProcess.Id `
      -ExpectedCommandFragment "Start-Sleep" `
      -ExpectedExecutablePath ([string] $raceRecord.ExecutablePath) `
      -ExpectedStartTimeFileTimeUtc $raceProcess.StartTime.ToUniversalTime().ToFileTimeUtc() `
      -StopTimeoutMilliseconds 2000
    Assert-True `
      -Condition $raceStopped `
      -Message "A nonzero taskkill descendant race rejected an exited tracked root generation."
    Assert-True `
      -Condition (-not [bool](Get-Process -Id $raceProcess.Id -ErrorAction SilentlyContinue)) `
      -Message "Taskkill race fixture did not stop the tracked root process."
  }
  finally {
    Set-Item function:Get-CommandPath -Value $originalGetCommandPath
    Remove-Variable taskkillTestPath -Scope Script -ErrorAction SilentlyContinue
    if (Get-Process -Id $raceProcess.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $raceProcess.Id -Force
    }
  }

  $taskkillNoStopPath = Join-Path $temporaryRoot "taskkill-root-remains.cmd"
  [System.IO.File]::WriteAllText(
    $taskkillNoStopPath,
    "@echo off`r`n>&2 echo ERROR: injected root remains`r`nexit /b 128`r`n",
    [System.Text.Encoding]::ASCII
  )
  $remainingProcess = Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", "Start-Sleep -Seconds 60") `
    -WindowStyle Hidden `
    -PassThru
  $originalGetCommandPath = (Get-Item function:Get-CommandPath).ScriptBlock
  $script:taskkillTestPath = $taskkillNoStopPath
  try {
    Set-Item function:Get-CommandPath -Value {
      param([string] $Name)
      if ($Name -eq "taskkill.exe") {
        return $script:taskkillTestPath
      }
      throw "Unexpected command lookup in taskkill root-remains test: $Name"
    }
    $remainingRecord = Get-CimInstance Win32_Process -Filter "ProcessId = $($remainingProcess.Id)"
    $remainingStopped = Stop-TrackedProcess `
      -ProcessId $remainingProcess.Id `
      -ExpectedCommandFragment "Start-Sleep" `
      -ExpectedExecutablePath ([string] $remainingRecord.ExecutablePath) `
      -ExpectedStartTimeFileTimeUtc $remainingProcess.StartTime.ToUniversalTime().ToFileTimeUtc() `
      -StopTimeoutMilliseconds 0
    Assert-True `
      -Condition (-not $remainingStopped) `
      -Message "A nonzero taskkill result was accepted while the tracked root generation remained alive."
    Assert-True `
      -Condition ([bool](Get-Process -Id $remainingProcess.Id -ErrorAction SilentlyContinue)) `
      -Message "The root-remains fixture unexpectedly stopped the tracked process."
  }
  finally {
    Set-Item function:Get-CommandPath -Value $originalGetCommandPath
    Remove-Variable taskkillTestPath -Scope Script -ErrorAction SilentlyContinue
    if (Get-Process -Id $remainingProcess.Id -ErrorAction SilentlyContinue) {
      Stop-Process -Id $remainingProcess.Id -Force
    }
  }

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
