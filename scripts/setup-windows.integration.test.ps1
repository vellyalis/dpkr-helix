#requires -Version 5.1

<#
Runs an opt-in, near-fresh-user integration test.

The test redirects USERPROFILE, APPDATA, LOCALAPPDATA, and npm's global prefix
to a validated temporary directory. It skips browser and external tunnel work,
installs from the current checkout, starts DevSpace on an unused loopback port,
checks the generated state, stops it through the copied script, and removes the
temporary directory.
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool] $Condition,
    [Parameter(Mandatory = $true)][string] $Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

function Read-Utf8Text {
  param([Parameter(Mandatory = $true)][string] $Path)
  $encoding = New-Object System.Text.UTF8Encoding($false, $true)
  return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Get-FreeTcpPort {
  $listener = New-Object System.Net.Sockets.TcpListener(
    [System.Net.IPAddress]::Loopback,
    0
  )
  $listener.Start()
  try {
    return ([System.Net.IPEndPoint] $listener.LocalEndpoint).Port
  }
  finally {
    $listener.Stop()
  }
}

function Test-TcpPort {
  param([int] $Port)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $task = $client.ConnectAsync("127.0.0.1", $Port)
    return $task.Wait(1000) -and $client.Connected
  }
  catch {
    return $false
  }
  finally {
    $client.Dispose()
  }
}

function Remove-TestDirectory {
  param([Parameter(Mandatory = $true)][string] $Path)
  for ($attempt = 0; $attempt -lt 12; $attempt += 1) {
    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      return
    }
    catch {
      if ($attempt -eq 11) {
        $extendedPath = if ($Path.StartsWith("\\?\")) { $Path } else { "\\?\" + $Path }
        [System.IO.Directory]::Delete($extendedPath, $true)
        if (Test-Path -LiteralPath $Path) {
          throw
        }
        return
      }
      Start-Sleep -Milliseconds 500
    }
  }
}

$sourceRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$setupPath = Join-Path $PSScriptRoot "setup-windows.ps1"
$systemTempRoot = (Resolve-Path -LiteralPath ([System.IO.Path]::GetTempPath())).Path.TrimEnd("\")
$integrationPrefix =
  "devspace portable " + [string]([char] 0x6625) + " integration-"
$temporaryRoot = Join-Path $systemTempRoot (
  $integrationPrefix + [Guid]::NewGuid().ToString("N")
)
$isolatedSourceRoot = Join-Path $temporaryRoot "source"
$sourceArchivePath = Join-Path $temporaryRoot "source.zip"
$savedEnvironment = [ordered]@{
  USERPROFILE = $env:USERPROFILE
  APPDATA = $env:APPDATA
  LOCALAPPDATA = $env:LOCALAPPDATA
  npm_config_prefix = $env:npm_config_prefix
  npm_config_cache = $env:npm_config_cache
}
$realAuthPath = Join-Path $env:USERPROFILE ".devspace\auth.json"
$realAuthHash = if (Test-Path -LiteralPath $realAuthPath) {
  (Get-FileHash -LiteralPath $realAuthPath -Algorithm SHA256).Hash
}
else {
  $null
}
$port = Get-FreeTcpPort
$copiedSetup = $null
$primaryError = $null

$staleCutoff = [DateTime]::UtcNow.AddMinutes(-1)
Get-ChildItem -LiteralPath $systemTempRoot -Directory -Filter ($integrationPrefix + "*") |
  Where-Object { $_.LastWriteTimeUtc -lt $staleCutoff } |
  ForEach-Object {
    $resolvedStalePath = (Resolve-Path -LiteralPath $_.FullName).Path
    Assert-True `
      -Condition ($resolvedStalePath.StartsWith(
          $systemTempRoot + "\" + $integrationPrefix,
          [System.StringComparison]::OrdinalIgnoreCase
        )) `
      -Message "Refusing to clean an unexpected stale integration-test directory."
    Remove-TestDirectory -Path $resolvedStalePath
  }

New-Item -ItemType Directory -Path $temporaryRoot | Out-Null
try {
  $git = Get-Command "git.exe" -ErrorAction Stop
  & $git.Source `
    -C $sourceRoot `
    archive `
    --format=zip `
    --output $sourceArchivePath `
    HEAD
  Assert-True -Condition ($LASTEXITCODE -eq 0) -Message "Unable to archive the verified HEAD."
  Expand-Archive -LiteralPath $sourceArchivePath -DestinationPath $isolatedSourceRoot

  $env:USERPROFILE = $temporaryRoot
  $env:APPDATA = Join-Path $temporaryRoot "AppData\Roaming"
  $env:LOCALAPPDATA = Join-Path $temporaryRoot "AppData\Local"
  $env:npm_config_prefix = Join-Path $temporaryRoot "npm-global"
  $env:npm_config_cache = Join-Path $savedEnvironment.LOCALAPPDATA "npm-cache"
  New-Item -ItemType Directory -Path $env:APPDATA -Force | Out-Null
  New-Item -ItemType Directory -Path $env:LOCALAPPDATA -Force | Out-Null
  New-Item -ItemType Directory -Path $env:npm_config_prefix -Force | Out-Null

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $setupPath `
      -Mode Install `
      -SourceRoot $isolatedSourceRoot `
      -AllowedRoot $isolatedSourceRoot `
      -Port $port `
      -TunnelMode External `
      -PublicBaseUrl https://portable-test.invalid `
      -SkipPrerequisites `
      -SkipCodexLogin `
      -SkipBrowserLaunch `
      -SkipVerification
    $installExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  Assert-True -Condition ($installExitCode -eq 0) -Message "Isolated Install mode failed."

  $devspaceDir = Join-Path $temporaryRoot ".devspace"
  $configPath = Join-Path $devspaceDir "config.json"
  $authPath = Join-Path $devspaceDir "auth.json"
  $settingsPath = Join-Path $devspaceDir "windows-bootstrap.json"
  $runtimePath = Join-Path $devspaceDir "windows-runtime.json"
  $copiedSetup = Join-Path $devspaceDir "setup-windows.ps1"
  $codexConfigPath = Join-Path $temporaryRoot ".codex\config.toml"
  $playwrightCliPath = Join-Path $temporaryRoot (
    ".codex\mcp\playwright\node_modules\@playwright\mcp\cli.js"
  )
  $browserLauncherPath = Join-Path $temporaryRoot (
    ".codex\mcp\playwright\start-managed-edge.ps1"
  )
  foreach ($path in @(
      $configPath,
      $authPath,
      $settingsPath,
      $runtimePath,
      $copiedSetup,
      $codexConfigPath,
      $playwrightCliPath,
      $browserLauncherPath
    )) {
    Assert-True -Condition (Test-Path -LiteralPath $path) -Message "Expected file is missing: $path"
  }
  $installedPackage = Join-Path $env:npm_config_prefix "node_modules\@waishnav\devspace"
  $helixShim = Join-Path $env:npm_config_prefix "helix.cmd"
  Assert-True `
    -Condition (-not ((Get-Item -LiteralPath $installedPackage).Attributes -band [IO.FileAttributes]::ReparsePoint)) `
    -Message "Installed DevSpace remains linked to the mutable source checkout."
  Assert-True `
    -Condition (Test-Path -LiteralPath $helixShim -PathType Leaf) `
    -Message "Global installation did not create the helix command shim."
  Assert-True `
    -Condition (Test-Path -LiteralPath (Join-Path $installedPackage "dist\helix-cli.js") -PathType Leaf) `
    -Message "Installed package is missing the Helix launcher entrypoint."
  $helixHelp = (& $helixShim help | Out-String)
  Assert-True `
    -Condition ($LASTEXITCODE -eq 0 -and $helixHelp.Contains("official Codex launcher")) `
    -Message "Installed helix command did not expose the launcher help surface."
  $sourceLockPath = Join-Path $isolatedSourceRoot "package-lock.json"
  $installedSqlitePath = Join-Path $installedPackage "node_modules\better-sqlite3\package.json"
  Assert-True `
    -Condition (Test-Path -LiteralPath (Join-Path $installedPackage "npm-shrinkwrap.json")) `
    -Message "Installed runtime is missing its deployment lock."
  $expectedSqliteVersion = (& node -e (
      "const lock=require(process.argv[1]);" +
      "process.stdout.write(lock.packages['node_modules/better-sqlite3'].version);"
    ) $sourceLockPath).Trim()
  Assert-True -Condition ($LASTEXITCODE -eq 0) -Message "Could not inspect the source dependency lock."
  $installedSqliteVersion = (& node -e (
      "const pkg=require(process.argv[1]);process.stdout.write(pkg.version);"
    ) $installedSqlitePath).Trim()
  Assert-True -Condition ($LASTEXITCODE -eq 0) -Message "Could not inspect the installed dependency."
  Assert-True `
    -Condition ($installedSqliteVersion -eq $expectedSqliteVersion) `
    -Message (
      "Installed runtime did not preserve the verified dependency lock. " +
      "Expected: $expectedSqliteVersion Actual: $installedSqliteVersion"
    )

  $config = Read-Utf8Text -Path $configPath | ConvertFrom-Json
  $auth = Read-Utf8Text -Path $authPath | ConvertFrom-Json
  $settings = Read-Utf8Text -Path $settingsPath | ConvertFrom-Json
  $runtime = Read-Utf8Text -Path $runtimePath | ConvertFrom-Json
  Assert-True -Condition ($config.host -eq "127.0.0.1") -Message "Config host is not loopback."
  Assert-True -Condition ([int] $config.port -eq $port) -Message "Config port differs from the test port."
  Assert-True -Condition ($config.allowedRoots.Count -eq 1) -Message "Config roots were broadened."
  Assert-True `
    -Condition ($config.allowedRoots[0] -eq $isolatedSourceRoot) `
    -Message "Config root is incorrect. Expected: $isolatedSourceRoot Actual: $($config.allowedRoots[0])"
  Assert-True -Condition ($config.subagents -eq $true) -Message "Subagents were not enabled."
  Assert-True -Condition (($auth.ownerToken -as [string]).Length -ge 40) -Message "Owner token is invalid."
  Assert-True -Condition (-not $runtime.cloudflaredPid) -Message "External mode started cloudflared."
  Assert-True -Condition ([int] $runtime.devspacePid -gt 0) -Message "DevSpace PID is invalid."
  Assert-True `
    -Condition ([string] $settings.runtimePackageSha256 -match "^[0-9a-f]{64}$") `
    -Message "Portable settings do not record a verified runtime recovery package."
  Assert-True `
    -Condition ([string] $settings.runtimeFingerprint -match "^[0-9a-f]{64}$") `
    -Message "Portable settings do not record the installed runtime fingerprint."
  $cachedRuntimePackage = Join-Path $devspaceDir (
    "runtime-packages\devspace-$($settings.runtimePackageSha256).tgz"
  )
  Assert-True `
    -Condition (Test-Path -LiteralPath $cachedRuntimePackage -PathType Leaf) `
    -Message "Verified runtime recovery package was not retained outside the global installation."
  Assert-True `
    -Condition ((Get-FileHash -LiteralPath $cachedRuntimePackage -Algorithm SHA256).Hash.ToLowerInvariant() -eq [string] $settings.runtimePackageSha256) `
    -Message "Retained runtime recovery package hash does not match portable settings."
  Assert-True `
    -Condition ($runtime.schema -eq "devspace-windows-runtime/v3") `
    -Message "Runtime state does not use the attested v3 schema."
  Assert-True `
    -Condition ([string] $runtime.devspaceRuntimeFingerprint -eq [string] $settings.runtimeFingerprint) `
    -Message "Runtime state fingerprint differs from portable settings."
  Assert-True `
    -Condition ([string] $runtime.runtimePackageSha256 -eq [string] $settings.runtimePackageSha256) `
    -Message "Runtime state package hash differs from portable settings."
  Assert-True -Condition (Test-TcpPort -Port $port) -Message "DevSpace did not listen on the test port."
  $codexConfig = Read-Utf8Text -Path $codexConfigPath
  $browserLauncher = Read-Utf8Text -Path $browserLauncherPath
  Assert-True `
    -Condition ($codexConfig.Contains("[mcp_servers.playwright]")) `
    -Message "Codex Playwright MCP section is missing."
  Assert-True `
    -Condition ($codexConfig.Contains("--cdp-endpoint=http://127.0.0.1:9222")) `
    -Message "Playwright MCP is not restricted to the loopback CDP endpoint."
  Assert-True `
    -Condition ($browserLauncher.Contains('"--user-data-dir=$quotedProfilePath"')) `
    -Message "The Edge profile argument is not quoted for paths containing spaces."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath (
          Join-Path $temporaryRoot ".codex\browser-profiles\playwright-mcp"
        ))) `
    -Message "Browser launch was not skipped during the integration test."
  $codexBackupFiles = @(
    Get-ChildItem `
      -LiteralPath (Join-Path $temporaryRoot ".codex") `
      -Filter ".config-devspace-*.backup" `
      -Force `
      -ErrorAction SilentlyContinue
  )
  Assert-True `
    -Condition ($codexBackupFiles.Count -eq 0) `
    -Message "A temporary Codex config backup remained after successful validation."

  & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $copiedSetup `
    -Mode Install `
    -SourceRoot $isolatedSourceRoot `
    -AllowedRoot $isolatedSourceRoot `
    -Port $port `
    -TunnelMode External `
    -PublicBaseUrl https://portable-test.invalid `
    -SkipPrerequisites `
    -SkipCodexLogin `
    -SkipBrowserLaunch `
    -SkipVerification
  Assert-True `
    -Condition ($LASTEXITCODE -eq 0) `
    -Message "Managed-script reinstallation failed while DevSpace was running."
  $reinstalledRuntime = Read-Utf8Text -Path $runtimePath | ConvertFrom-Json
  Assert-True `
    -Condition ([int] $reinstalledRuntime.devspacePid -gt 0) `
    -Message "Managed-script reinstallation did not record the restarted DevSpace process."
  Assert-True `
    -Condition (Test-TcpPort -Port $port) `
    -Message "DevSpace did not listen after managed-script reinstallation."

  $pidBeforeArtifactLoss = [int] $reinstalledRuntime.devspacePid
  $installedCliPath = Join-Path $installedPackage "dist\cli.js"
  $runtimePackageBackup = Join-Path $temporaryRoot "runtime-package.backup.tgz"
  Copy-Item `
    -LiteralPath $cachedRuntimePackage `
    -Destination $runtimePackageBackup `
    -Force
  $settingsBeforeFailClosed = Read-Utf8Text -Path $settingsPath | ConvertFrom-Json
  Remove-Item -LiteralPath $installedCliPath -Force
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $installedCliPath -PathType Leaf)) `
    -Message "The integration fixture did not remove the installed CLI artifact."
  Assert-True `
    -Condition (Test-TcpPort -Port $port) `
    -Message "Removing the on-disk CLI unexpectedly stopped the already-running service."

  [System.IO.File]::WriteAllText(
    $cachedRuntimePackage,
    "corrupt recovery package",
    (New-Object System.Text.UTF8Encoding($false))
  )
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & powershell.exe `
      -NoProfile `
      -NonInteractive `
      -ExecutionPolicy Bypass `
      -File $copiedSetup `
      -Mode Start `
      -SkipVerification `
      -SkipBrowserLaunch 2>&1 | Out-Null
    $untrustedCopiesExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  Assert-True `
    -Condition ($untrustedCopiesExitCode -ne 0) `
    -Message "Start trusted a damaged recovery package and mismatched installed runtime."
  Assert-True `
    -Condition ([bool](Get-Process -Id $pidBeforeArtifactLoss -ErrorAction SilentlyContinue)) `
    -Message "Fail-closed recovery stopped the still-running attested process before trust was resolved."
  Assert-True `
    -Condition (Test-TcpPort -Port $port) `
    -Message "Fail-closed recovery disrupted the still-running service."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $installedCliPath -PathType Leaf)) `
    -Message "Fail-closed recovery silently replaced the damaged installed runtime."
  $settingsAfterFailClosed = Read-Utf8Text -Path $settingsPath | ConvertFrom-Json
  Assert-True `
    -Condition (
      [string] $settingsAfterFailClosed.runtimePackageSha256 -eq
        [string] $settingsBeforeFailClosed.runtimePackageSha256 -and
      [string] $settingsAfterFailClosed.runtimeFingerprint -eq
        [string] $settingsBeforeFailClosed.runtimeFingerprint
    ) `
    -Message "Fail-closed recovery blessed a new package hash or runtime fingerprint."
  Copy-Item `
    -LiteralPath $runtimePackageBackup `
    -Destination $cachedRuntimePackage `
    -Force
  Assert-True `
    -Condition ((Get-FileHash -LiteralPath $cachedRuntimePackage -Algorithm SHA256).Hash.ToLowerInvariant() -eq [string] $settingsBeforeFailClosed.runtimePackageSha256) `
    -Message "The integration fixture did not restore the verified recovery package."

  & powershell.exe `
    -NoProfile `
    -NonInteractive `
    -ExecutionPolicy Bypass `
    -File $copiedSetup `
    -Mode Start `
    -SkipVerification `
    -SkipBrowserLaunch
  Assert-True `
    -Condition ($LASTEXITCODE -eq 0) `
    -Message "Managed Start did not repair a missing installed CLI from the retained package."
  Assert-True `
    -Condition (Test-Path -LiteralPath $installedCliPath -PathType Leaf) `
    -Message "Runtime recovery did not restore the missing CLI artifact."
  $repairedRuntime = Read-Utf8Text -Path $runtimePath | ConvertFrom-Json
  Assert-True `
    -Condition ([int] $repairedRuntime.devspacePid -ne $pidBeforeArtifactLoss) `
    -Message "Artifact corruption reused the stale process instead of performing a managed repair."
  Assert-True `
    -Condition (Test-TcpPort -Port $port) `
    -Message "DevSpace did not listen after package-based runtime repair."

  $pidBeforeOriginDrift = [int] $repairedRuntime.devspacePid
  $driftedConfig = Read-Utf8Text -Path $configPath | ConvertFrom-Json
  $driftedConfig.publicBaseUrl = "https://obsolete.trycloudflare.com"
  [System.IO.File]::WriteAllText(
    $configPath,
    (($driftedConfig | ConvertTo-Json -Depth 12) + "`n"),
    (New-Object System.Text.UTF8Encoding($false))
  )
  & powershell.exe `
    -NoProfile `
    -NonInteractive `
    -ExecutionPolicy Bypass `
    -File $copiedSetup `
    -Mode Start `
    -SkipVerification `
    -SkipBrowserLaunch
  Assert-True `
    -Condition ($LASTEXITCODE -eq 0) `
    -Message "Managed Start did not reconcile a stale public-origin configuration."
  $originReconciledRuntime = Read-Utf8Text -Path $runtimePath | ConvertFrom-Json
  $originReconciledConfig = Read-Utf8Text -Path $configPath | ConvertFrom-Json
  Assert-True `
    -Condition ([int] $originReconciledRuntime.devspacePid -ne $pidBeforeOriginDrift) `
    -Message "A stale advertised origin reused the old process."
  Assert-True `
    -Condition ($originReconciledConfig.publicBaseUrl -eq "https://portable-test.invalid") `
    -Message "Managed Start did not restore the saved stable External origin."

  & powershell.exe `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $copiedSetup `
    -Mode Stop
  Assert-True -Condition ($LASTEXITCODE -eq 0) -Message "Isolated Stop mode failed."
  Assert-True -Condition (-not (Test-Path -LiteralPath $runtimePath)) -Message "Runtime state remained after Stop."
  Assert-True -Condition (-not (Test-TcpPort -Port $port)) -Message "DevSpace still listens after Stop."

  $collisionListener = New-Object System.Net.Sockets.TcpListener(
    [System.Net.IPAddress]::Loopback,
    $port
  )
  $collisionListener.Start()
  try {
    $previousErrorPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
      & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $copiedSetup `
        -Mode Start `
        -SkipVerification `
        -SkipBrowserLaunch 2>&1 | Out-Null
      $collisionExitCode = $LASTEXITCODE
    }
    finally {
      $ErrorActionPreference = $previousErrorPreference
    }
    Assert-True -Condition ($collisionExitCode -ne 0) -Message "Start accepted an occupied port."
    Assert-True -Condition $collisionListener.Server.IsBound -Message "The unrelated listener was stopped."
    Assert-True -Condition (-not (Test-Path -LiteralPath $runtimePath)) -Message "Occupied-port failure wrote runtime state."
  }
  finally {
    $collisionListener.Stop()
  }

  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $copiedSetup `
      -Mode Start `
      -SkipBrowserLaunch 2>&1 | Out-Null
    $verificationFailureExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  Assert-True `
    -Condition ($verificationFailureExitCode -ne 0) `
    -Message "Start unexpectedly verified the reserved invalid public origin."
  Assert-True `
    -Condition (-not (Test-Path -LiteralPath $runtimePath)) `
    -Message "Verification failure did not remove runtime state."
  Assert-True `
    -Condition (-not (Test-TcpPort -Port $port)) `
    -Message "Verification failure left DevSpace listening."

  $fakeRuntime = [ordered]@{
    schema = "devspace-windows-runtime/v2"
    devspacePid = $PID
    devspaceExecutablePath = "C:\not-the-current-process.exe"
    devspaceCommandFragment = "not-the-current-command"
    devspaceStartTimeFileTimeUtc = 1
    cloudflaredPid = $null
  }
  [System.IO.File]::WriteAllText(
    $runtimePath,
    (($fakeRuntime | ConvertTo-Json -Depth 4) + "`n"),
    (New-Object System.Text.UTF8Encoding($false))
  )
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & powershell.exe `
      -NoProfile `
      -ExecutionPolicy Bypass `
      -File $copiedSetup `
      -Mode Stop 2>&1 | Out-Null
    $identityMismatchExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  Assert-True -Condition ($identityMismatchExitCode -ne 0) -Message "Stop accepted a mismatched process identity."
  Assert-True -Condition (Test-Path -LiteralPath $runtimePath) -Message "Stop discarded mismatched runtime state."
  Assert-True -Condition ([bool](Get-Process -Id $PID -ErrorAction SilentlyContinue)) -Message "Stop killed the test runner."
  Remove-Item -LiteralPath $runtimePath -Force
}
catch {
  $primaryError = $_
  foreach ($diagnosticPath in @(
      (Join-Path $temporaryRoot ".devspace\logs\devspace.err.log"),
      (Join-Path $temporaryRoot ".devspace\logs\devspace.out.log")
    )) {
    if (-not (Test-Path -LiteralPath $diagnosticPath -PathType Leaf)) {
      continue
    }
    $diagnosticText = Read-Utf8Text -Path $diagnosticPath
    if ($diagnosticText) {
      Write-Warning (
        "Integration runtime diagnostic from $diagnosticPath`n" +
        $diagnosticText.Substring([Math]::Max(0, $diagnosticText.Length - 8192))
      )
    }
  }
}
finally {
  if ($copiedSetup -and (Test-Path -LiteralPath $copiedSetup)) {
    $runtimePath = Join-Path (Split-Path -Parent $copiedSetup) "windows-runtime.json"
    if (Test-Path -LiteralPath $runtimePath) {
      & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $copiedSetup `
        -Mode Stop | Out-Null
    }
  }

  $env:USERPROFILE = $savedEnvironment.USERPROFILE
  $env:APPDATA = $savedEnvironment.APPDATA
  $env:LOCALAPPDATA = $savedEnvironment.LOCALAPPDATA
  $env:npm_config_prefix = $savedEnvironment.npm_config_prefix
  $env:npm_config_cache = $savedEnvironment.npm_config_cache

  if ($realAuthHash) {
    $currentHash = (Get-FileHash -LiteralPath $realAuthPath -Algorithm SHA256).Hash
    Assert-True -Condition ($currentHash -eq $realAuthHash) -Message "The real DevSpace auth file changed."
  }

  if (Test-Path -LiteralPath $temporaryRoot) {
    $resolvedTemporaryRoot = (Resolve-Path -LiteralPath $temporaryRoot).Path
    Assert-True `
      -Condition ($resolvedTemporaryRoot.StartsWith(
          $systemTempRoot + "\",
          [System.StringComparison]::OrdinalIgnoreCase
        )) `
      -Message "Refusing to clean an unexpected integration-test directory."
    try {
      Remove-TestDirectory -Path $resolvedTemporaryRoot
    }
    catch {
      if ($primaryError) {
        Write-Warning "Integration cleanup also failed: $($_.Exception.Message)"
      }
      else {
        $primaryError = $_
      }
    }
  }
}

if ($primaryError) {
  throw $primaryError
}

Write-Host "setup-windows integration test: pass"
