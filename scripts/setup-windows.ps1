#requires -Version 5.1

<#
.SYNOPSIS
Installs, configures, starts, stops, or previews a portable DevSpace setup on Windows.

.DESCRIPTION
Install mode builds this verified checkout, installs DevSpace and Codex, creates
new per-PC credentials, configures narrow allowed roots, installs a pinned
Playwright MCP runtime, starts DevSpace and either a Quick Tunnel or an external
HTTPS endpoint, and verifies local Codex delegation.

The script never copies credentials from another PC and never registers an
automatic startup task. ChatGPT, Cloudflare, and OpenAI account sign-ins remain
interactive.

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -AllowedRoot C:\src\my-project

.EXAMPLE
powershell -ExecutionPolicy Bypass -File .\scripts\setup-windows.ps1 `
  -Mode Plan -AllowedRoot C:\src\my-project

.EXAMPLE
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Start

.EXAMPLE
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Stop

.EXAMPLE
& "$env:USERPROFILE\.devspace\setup-windows.ps1" -Mode Update
#>

[CmdletBinding()]
param(
  [ValidateSet("Install", "Start", "Stop", "Plan", "Update", "LaunchUpdate")]
  [string] $Mode = "Install",

  [string] $SourceRoot,

  [string[]] $AllowedRoot,

  [ValidateRange(1, 65535)]
  [int] $Port = 7676,

  [ValidateSet("QuickTunnel", "External")]
  [string] $TunnelMode = "QuickTunnel",

  [string] $PublicBaseUrl,

  [string] $CodexModel = "gpt-5.6-sol",

  [string] $CodexCliVersion = "0.145.0",

  [string] $PlaywrightMcpVersion = "0.0.78",

  [switch] $SkipPrerequisites,

  [switch] $SkipCodexLogin,

  [switch] $SkipBrowser,

  [switch] $SkipBrowserLaunch,

  [switch] $SkipVerification,

  [switch] $RecoveryStart,

  [ValidatePattern("^[0-9a-fA-F-]{16,64}$")]
  [string] $UpdateRequestId
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version 2.0

$script:ManagedProfileMarker = "<!-- managed-by-devspace-setup-windows -->"
$script:PlaywrightBlockBegin = "# BEGIN DEVSPACE PLAYWRIGHT MCP"
$script:PlaywrightBlockEnd = "# END DEVSPACE PLAYWRIGHT MCP"
$script:DevSpaceDir = Join-Path $env:USERPROFILE ".devspace"
$script:CodexDir = Join-Path $env:USERPROFILE ".codex"
$script:SettingsPath = Join-Path $script:DevSpaceDir "windows-bootstrap.json"
$script:RuntimeStatePath = Join-Path $script:DevSpaceDir "windows-runtime.json"
$script:DevSpaceConfigPath = Join-Path $script:DevSpaceDir "config.json"
$script:DevSpaceAuthPath = Join-Path $script:DevSpaceDir "auth.json"
$script:ManagedScriptPath = Join-Path $script:DevSpaceDir "setup-windows.ps1"
$script:ManagedRecoveryPath = Join-Path $script:DevSpaceDir "setup-windows-recovery.ps1"
$script:UpdateStatusPath = Join-Path $script:DevSpaceDir "windows-update.json"
$script:RuntimePackageDir = Join-Path $script:DevSpaceDir "runtime-packages"
$script:LogDir = Join-Path $script:DevSpaceDir "logs"
$script:RuntimeMutexName = "Local\dpkr-helix-windows-runtime"
$script:UpdateMutexName = "Local\dpkr-helix-windows-update"
$script:ManagedRecoveryMarker = "managed-by-dpkr-helix-windows-recovery"
$script:CanonicalOriginUrl = "https://github.com/vellyalis/dpkr-helix.git"

function Write-Step {
  param([string] $Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Copy-FileAtomic {
  param(
    [Parameter(Mandatory = $true)][string] $SourcePath,
    [Parameter(Mandatory = $true)][string] $DestinationPath
  )
  $resolvedSource = [System.IO.Path]::GetFullPath($SourcePath)
  $resolvedDestination = [System.IO.Path]::GetFullPath($DestinationPath)
  if (
    [string]::Equals(
      $resolvedSource,
      $resolvedDestination,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return
  }
  $destinationDirectory = Split-Path -Parent $resolvedDestination
  if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  }
  $temporaryPath = Join-Path $destinationDirectory (
    ".tmp-" + [Guid]::NewGuid().ToString("N") + ".copy"
  )
  try {
    Copy-Item -LiteralPath $resolvedSource -Destination $temporaryPath -Force
    Move-Item -LiteralPath $temporaryPath -Destination $resolvedDestination -Force
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Sync-ManagedSetupScript {
  param([Parameter(Mandatory = $true)][string] $SourcePath)
  Copy-FileAtomic -SourcePath $SourcePath -DestinationPath $script:ManagedScriptPath
}

function Sync-ManagedRecoveryScript {
  param([Parameter(Mandatory = $true)][string] $SourcePath)
  if (-not (Test-Path -LiteralPath $script:ManagedRecoveryPath -PathType Leaf)) {
    return
  }
  $managedContent = Read-Utf8Text -Path $script:ManagedRecoveryPath
  $sourceContent = Read-Utf8Text -Path $SourcePath
  if (-not $managedContent.Contains($script:ManagedRecoveryMarker)) {
    throw "Refusing to replace an unmanaged recovery script."
  }
  if (-not $sourceContent.Contains($script:ManagedRecoveryMarker)) {
    throw "The candidate recovery script is missing its managed marker."
  }
  Copy-FileAtomic -SourcePath $SourcePath -DestinationPath $script:ManagedRecoveryPath
}

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Content
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
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $temporaryPath = Join-Path $directory (".tmp-" + [Guid]::NewGuid().ToString("N") + ".json")
  try {
    Write-Utf8NoBom -Path $temporaryPath -Content (($Value | ConvertTo-Json -Depth 12) + "`n")
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Read-Utf8Text {
  param([Parameter(Mandatory = $true)][string] $Path)
  $encoding = New-Object System.Text.UTF8Encoding($false, $true)
  return [System.IO.File]::ReadAllText($Path, $encoding)
}

function Read-Utf8TextShared {
  param([Parameter(Mandatory = $true)][string] $Path)
  $encoding = New-Object System.Text.UTF8Encoding($false, $true)
  $stream = [System.IO.File]::Open(
    $Path,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite
  )
  try {
    $reader = New-Object System.IO.StreamReader($stream, $encoding, $true, 1024, $true)
    try {
      return $reader.ReadToEnd()
    }
    finally {
      $reader.Dispose()
    }
  }
  finally {
    $stream.Dispose()
  }
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }
  return Read-Utf8Text -Path $Path | ConvertFrom-Json
}

function Enter-RuntimeOperation {
  param([int] $TimeoutMilliseconds = 15000)
  $mutex = New-Object System.Threading.Mutex($false, $script:RuntimeMutexName)
  try {
    $acquired = $false
    try {
      $acquired = $mutex.WaitOne($TimeoutMilliseconds)
    }
    catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    if (-not $acquired) {
      throw "Another dpkr helix start, stop, or install operation is still running. Try again shortly."
    }
    return $mutex
  }
  catch {
    $mutex.Dispose()
    throw
  }
}

function Exit-RuntimeOperation {
  param([Parameter(Mandatory = $true)] $Mutex)
  try {
    $Mutex.ReleaseMutex()
  }
  finally {
    $Mutex.Dispose()
  }
}

function Enter-UpdateOperation {
  $mutex = New-Object System.Threading.Mutex($false, $script:UpdateMutexName)
  try {
    $acquired = $false
    try {
      $acquired = $mutex.WaitOne(0)
    }
    catch [System.Threading.AbandonedMutexException] {
      $acquired = $true
    }
    if (-not $acquired) {
      throw "DPKR_UPDATE[UPDATE_IN_PROGRESS] Another dpkr helix update is already running."
    }
    return $mutex
  }
  catch {
    $mutex.Dispose()
    throw
  }
}

function Write-UpdateStatus {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("preflight", "applying", "up_to_date", "succeeded", "rolled_back", "rejected", "failed")]
    [string] $State,
    [Parameter(Mandatory = $true)][string] $RequestId,
    [string] $FromCommit,
    [string] $TargetCommit,
    [string] $StartedAt,
    [string] $Code
  )
  $now = [DateTime]::UtcNow.ToString("o")
  if (-not $StartedAt) {
    $StartedAt = $now
  }
  $terminal = $State -in @("up_to_date", "succeeded", "rolled_back", "rejected", "failed")
  Write-JsonAtomic -Path $script:UpdateStatusPath -Value ([ordered]@{
      schema = "dpkr-helix-windows-update/v1"
      state = $State
      requestId = $RequestId
      fromCommit = $FromCommit
      targetCommit = $TargetCommit
      startedAt = $StartedAt
      updatedAt = $now
      completedAt = if ($terminal) { $now } else { $null }
      code = $Code
      updaterPid = $PID
    })
}

function Throw-UpdateFailure {
  param(
    [Parameter(Mandatory = $true)][string] $Code,
    [Parameter(Mandatory = $true)][string] $Message
  )
  throw "DPKR_UPDATE[$Code] $Message"
}

function Get-UpdateFailureCode {
  param([Parameter(Mandatory = $true)] $ErrorRecord)
  $message = [string] $ErrorRecord.Exception.Message
  $match = [regex]::Match($message, "^DPKR_UPDATE\[([A-Z0-9_]+)\]")
  if ($match.Success) {
    return $match.Groups[1].Value
  }
  return $null
}

function Get-DesiredRuntimeState {
  param([Parameter(Mandatory = $true)] $Settings)
  $saved = [string](Get-PropertyValue -InputObject $Settings -Name "desiredState")
  if (-not $saved) {
    if (Test-Path -LiteralPath $script:RuntimeStatePath -PathType Leaf) {
      return "running"
    }
    return "stopped"
  }
  if ($saved -notin @("running", "stopped")) {
    throw "Saved desiredState must be running or stopped."
  }
  return $saved
}

function Set-DesiredRuntimeState {
  param([Parameter(Mandatory = $true)][ValidateSet("running", "stopped")][string] $State)
  $settings = Read-JsonFile -Path $script:SettingsPath
  if (-not $settings) {
    if ($State -eq "stopped") {
      return $null
    }
    throw "Portable setup settings are missing. Run this script in Install mode first."
  }
  $settings | Add-Member -NotePropertyName "desiredState" -NotePropertyValue $State -Force
  Write-JsonAtomic -Path $script:SettingsPath -Value $settings
  return $settings
}

function Rotate-LogFile {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return
  }
  $previous = "$Path.previous"
  if (Test-Path -LiteralPath $previous -PathType Leaf) {
    Remove-Item -LiteralPath $previous -Force
  }
  Move-Item -LiteralPath $Path -Destination $previous -Force
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

function Resolve-ExistingDirectory {
  param([Parameter(Mandatory = $true)][string] $Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    throw "Directory does not exist: $Path"
  }
  return (Resolve-Path -LiteralPath $Path).Path
}

function Resolve-SourceRoot {
  param([string] $RequestedRoot)
  $candidate = $RequestedRoot
  if (-not $candidate) {
    $savedSettings = Read-JsonFile -Path $script:SettingsPath
    if ($savedSettings -and $savedSettings.sourceRoot) {
      $candidate = [string] $savedSettings.sourceRoot
    }
    else {
      $candidate = Split-Path -Parent $PSScriptRoot
    }
  }
  $resolved = Resolve-ExistingDirectory -Path $candidate
  $packagePath = Join-Path $resolved "package.json"
  if (-not (Test-Path -LiteralPath $packagePath)) {
    throw "DevSpace package.json was not found under: $resolved"
  }
  $package = Read-Utf8Text -Path $packagePath | ConvertFrom-Json
  if ($package.name -ne "@waishnav/devspace") {
    throw "SourceRoot is not a DevSpace checkout: $resolved"
  }
  return $resolved
}

function Resolve-AllowedRoots {
  param(
    [string[]] $RequestedRoots,
    [string] $DefaultRoot
  )
  $roots = @()
  if ($RequestedRoots -and $RequestedRoots.Count -gt 0) {
    $roots = @($RequestedRoots)
  }
  else {
    $roots = @($DefaultRoot)
  }
  $resolved = @()
  foreach ($root in $roots) {
    $path = Resolve-ExistingDirectory -Path $root
    if ($resolved -notcontains $path) {
      $resolved += $path
    }
  }
  return $resolved
}

function Normalize-HttpsOrigin {
  param([Parameter(Mandatory = $true)][string] $Value)
  try {
    $uri = New-Object System.Uri($Value)
  }
  catch {
    throw "PublicBaseUrl is not a valid URL: $Value"
  }
  if ($uri.Scheme -ne "https") {
    throw "PublicBaseUrl must use HTTPS: $Value"
  }
  return $Value.TrimEnd("/")
}

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $parts = @($machinePath, $userPath) | Where-Object { $_ }
  $env:Path = $parts -join ";"
}

function Get-CommandPath {
  param([Parameter(Mandatory = $true)][string] $Name)
  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) {
    return $command.Source
  }
  return $null
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [string[]] $Arguments = @()
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed with exit code $LASTEXITCODE`: $FilePath $($Arguments -join ' ')"
  }
}

function Invoke-CapturedChecked {
  param(
    [Parameter(Mandatory = $true)][string] $FilePath,
    [string[]] $Arguments = @()
  )
  $output = & $FilePath @Arguments 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    throw "Command failed with exit code $exitCode`: $FilePath $($Arguments -join ' ')"
  }
  return $output.Trim()
}

function Get-SourceUpdatePlan {
  param([Parameter(Mandatory = $true)][string] $Root)
  $git = Get-CommandPath -Name "git.exe"
  if (-not $git) {
    $git = Get-CommandPath -Name "git"
  }
  if (-not $git) {
    Throw-UpdateFailure -Code "GIT_MISSING" -Message "Git is required for updates."
  }

  try {
    $topLevel = Invoke-CapturedChecked -FilePath $git -Arguments @(
      "-C", $Root, "rev-parse", "--show-toplevel"
    )
  }
  catch {
    Throw-UpdateFailure -Code "SOURCE_NOT_GIT" -Message "The managed source is not a Git checkout."
  }
  $resolvedTopLevel = [System.IO.Path]::GetFullPath($topLevel)
  $resolvedRoot = [System.IO.Path]::GetFullPath($Root)
  if (-not [string]::Equals(
      $resolvedTopLevel,
      $resolvedRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    Throw-UpdateFailure -Code "SOURCE_ROOT_MISMATCH" -Message (
      "The managed source must be the Git worktree root."
    )
  }

  $branch = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $Root, "branch", "--show-current"
  )
  if ($branch -ne "main") {
    Throw-UpdateFailure -Code "WRONG_BRANCH" -Message (
      "Updates require the managed checkout to be on main."
    )
  }
  $dirty = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $Root, "status", "--porcelain", "--untracked-files=normal"
  )
  if ($dirty) {
    Throw-UpdateFailure -Code "DIRTY_WORKTREE" -Message (
      "The managed main checkout has local changes. Commit or move them before updating."
    )
  }
  $originUrl = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $Root, "remote", "get-url", "origin"
  )
  if (-not [string]::Equals(
      $originUrl.TrimEnd("/"),
      $script:CanonicalOriginUrl.TrimEnd("/"),
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    Throw-UpdateFailure -Code "UNTRUSTED_ORIGIN" -Message (
      "The managed origin is not the canonical dpkr helix repository."
    )
  }

  $fromCommit = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $Root, "rev-parse", "HEAD^{commit}"
  )
  try {
    Invoke-Checked -FilePath $git -Arguments @("-C", $Root, "fetch", "origin", "main")
  }
  catch {
    Throw-UpdateFailure -Code "FETCH_FAILED" -Message "origin/main could not be fetched."
  }
  $targetCommit = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $Root, "rev-parse", "refs/remotes/origin/main^{commit}"
  )
  & $git -C $Root merge-base --is-ancestor $fromCommit $targetCommit
  $isFastForward = $LASTEXITCODE -eq 0
  if (-not $isFastForward) {
    Throw-UpdateFailure -Code "NON_FAST_FORWARD" -Message (
      "The managed main checkout has diverged from origin/main; it was not changed."
    )
  }
  return [pscustomobject]@{
    Git = $git
    Root = $resolvedRoot
    FromCommit = $fromCommit
    TargetCommit = $targetCommit
  }
}

function New-UpdateTemporaryRoot {
  $temporaryParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  $root = Join-Path $temporaryParent (
    "dpkr-helix-update-" + [Guid]::NewGuid().ToString("N")
  )
  New-Item -ItemType Directory -Path $root | Out-Null
  return [System.IO.Path]::GetFullPath($root)
}

function Remove-UpdateTemporaryRoot {
  param([Parameter(Mandatory = $true)][string] $Path)
  $resolved = [System.IO.Path]::GetFullPath($Path)
  $directorySeparators = [char[]] @(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $temporaryParent = (
    [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
  ).TrimEnd($directorySeparators)
  $parent = [System.IO.Path]::GetFullPath((Split-Path -Parent $resolved))
  $leaf = Split-Path -Leaf $resolved
  if (
    -not [string]::Equals($parent, $temporaryParent, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not $leaf.StartsWith("dpkr-helix-update-", [System.StringComparison]::Ordinal)
  ) {
    throw "Refusing to remove an unexpected update temporary path."
  }
  if (Test-Path -LiteralPath $resolved -PathType Container) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}

function Add-UpdateWorktree {
  param(
    [Parameter(Mandatory = $true)] $Plan,
    [Parameter(Mandatory = $true)][string] $Path
  )
  Invoke-Checked -FilePath ([string] $Plan.Git) -Arguments @(
    "-C", ([string] $Plan.Root),
    "worktree", "add", "--detach", $Path, ([string] $Plan.TargetCommit)
  )
}

function Remove-UpdateWorktree {
  param(
    [Parameter(Mandatory = $true)] $Plan,
    [Parameter(Mandatory = $true)][string] $Path
  )
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    return
  }
  Invoke-Checked -FilePath ([string] $Plan.Git) -Arguments @(
    "-C", ([string] $Plan.Root), "worktree", "remove", "--force", $Path
  )
}

function Invoke-UpdatePreflight {
  param([Parameter(Mandatory = $true)][string] $Root)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    Throw-UpdateFailure -Code "NPM_MISSING" -Message "npm is required for updates."
  }
  Write-Step "Verifying the update candidate before stopping dpkr helix"
  Push-Location $Root
  try {
    Invoke-Checked -FilePath $npm -Arguments @("ci", "--include=dev", "--no-audit")
    Invoke-Checked -FilePath $npm -Arguments @("run", "audit:production")
    Invoke-Checked -FilePath $npm -Arguments @("run", "typecheck")
    Invoke-Checked -FilePath $npm -Arguments @("test")
    Invoke-Checked -FilePath $npm -Arguments @("run", "build")
    Invoke-Checked -FilePath $npm -Arguments @("run", "check:public")
    $powershell = Get-CommandPath -Name "powershell.exe"
    if (-not $powershell) {
      throw "Windows PowerShell is required for portable recovery verification."
    }
    foreach ($testScript in @(
        "scripts\setup-windows.test.ps1",
        "scripts\setup-windows-recovery.test.ps1"
      )) {
      Invoke-Checked -FilePath $powershell -Arguments @(
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy", "Bypass",
        "-File", (Join-Path $Root $testScript)
      )
    }
  }
  catch {
    Throw-UpdateFailure -Code "PREFLIGHT_FAILED" -Message (
      "The candidate failed local install, audit, tests, build, or public checks."
    )
  }
  finally {
    Pop-Location
  }
}

function New-DevSpacePackage {
  param(
    [Parameter(Mandatory = $true)][string] $Root,
    [Parameter(Mandatory = $true)][string] $Destination
  )
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    Throw-UpdateFailure -Code "NPM_MISSING" -Message "npm is required for update packaging."
  }
  $lockPath = Join-Path $Root "package-lock.json"
  $shrinkwrapPath = Join-Path $Root "npm-shrinkwrap.json"
  $createdShrinkwrap = $false
  if (-not (Test-Path -LiteralPath $lockPath -PathType Leaf)) {
    Throw-UpdateFailure -Code "PACKAGE_LOCK_MISSING" -Message (
      "The verified package lock is missing."
    )
  }
  if (-not (Test-Path -LiteralPath $shrinkwrapPath -PathType Leaf)) {
    Copy-FileAtomic -SourcePath $lockPath -DestinationPath $shrinkwrapPath
    $createdShrinkwrap = $true
  }
  Push-Location $Root
  try {
    if (-not (Test-Path -LiteralPath (Join-Path $Root "dist\cli.js") -PathType Leaf)) {
      Invoke-Checked -FilePath $npm -Arguments @("run", "build") | Out-Null
    }
    Invoke-Checked -FilePath $npm -Arguments @(
      "pack", "--silent", "--pack-destination", $Destination
    ) | Out-Null
  }
  finally {
    Pop-Location
    if ($createdShrinkwrap -and (Test-Path -LiteralPath $shrinkwrapPath -PathType Leaf)) {
      Remove-Item -LiteralPath $shrinkwrapPath -Force
    }
  }
  $packages = @(Get-ChildItem -LiteralPath $Destination -Filter "*.tgz" -File)
  if ($packages.Count -ne 1) {
    Throw-UpdateFailure -Code "PACKAGE_FAILED" -Message (
      "The verified installation could not be packaged."
    )
  }
  return $packages[0].FullName
}

function New-InstalledDevSpaceRollbackPackage {
  param([Parameter(Mandatory = $true)][string] $Destination)
  $settings = Read-JsonFile -Path $script:SettingsPath
  if ($settings) {
    try {
      $cached = Get-ValidatedRuntimePackage -Settings $settings
      $cachedCopy = Join-Path $Destination (
        "devspace-rollback-" + ([string] $cached.Hash) + ".tgz"
      )
      Copy-FileAtomic -SourcePath ([string] $cached.Path) -DestinationPath $cachedCopy
      return $cachedCopy
    }
    catch {
      Write-Warning (
        "The managed recovery package is unavailable; attempting to capture the installed runtime. " +
        $_.Exception.Message
      )
    }
  }
  return New-InstalledDevSpacePackage -Destination $Destination
}

function New-InstalledDevSpacePackage {
  param([Parameter(Mandatory = $true)][string] $Destination)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    Throw-UpdateFailure -Code "NPM_MISSING" -Message "npm is required for rollback packaging."
  }
  $installedRoot = Join-Path (Get-GlobalNpmRoot) "@waishnav\devspace"
  $installedItem = Get-Item -LiteralPath $installedRoot -Force -ErrorAction Stop
  if ($installedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    Throw-UpdateFailure -Code "ROLLBACK_SOURCE_INVALID" -Message (
      "The installed runtime is linked to mutable source and cannot be captured safely."
    )
  }
  foreach ($relativePath in @("package.json", "npm-shrinkwrap.json", "dist\cli.js")) {
    if (-not (Test-Path -LiteralPath (Join-Path $installedRoot $relativePath) -PathType Leaf)) {
      Throw-UpdateFailure -Code "ROLLBACK_SOURCE_INVALID" -Message (
        "The installed runtime is incomplete and no verified recovery package is available."
      )
    }
  }
  Push-Location $installedRoot
  try {
    Invoke-Checked -FilePath $npm -Arguments @(
      "pack", "--silent", "--pack-destination", $Destination
    ) | Out-Null
  }
  finally {
    Pop-Location
  }
  $packages = @(Get-ChildItem -LiteralPath $Destination -Filter "*.tgz" -File)
  if ($packages.Count -ne 1) {
    Throw-UpdateFailure -Code "PACKAGE_FAILED" -Message (
      "The running installation could not be captured for rollback."
    )
  }
  return $packages[0].FullName
}

function Install-BuiltDevSpacePackage {
  param([Parameter(Mandatory = $true)][string] $PackagePath)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    throw "npm is not available."
  }
  $globalPrefix = Get-GlobalNpmPrefix
  Invoke-Checked -FilePath $npm -Arguments @(
    "install",
    "--global",
    "--prefix", $globalPrefix,
    "--prefer-offline",
    "--allow-scripts=@waishnav/devspace",
    $PackagePath
  )
  $installedRoot = Join-Path $globalPrefix "node_modules\@waishnav\devspace"
  $installedItem = Get-Item -LiteralPath $installedRoot -Force -ErrorAction Stop
  if ($installedItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "The installed DevSpace runtime is linked to a mutable source directory."
  }
  if (-not (Test-Path -LiteralPath (Join-Path $installedRoot "npm-shrinkwrap.json") -PathType Leaf)) {
    throw "The installed DevSpace runtime is missing its deployment lock."
  }
  Push-Location $installedRoot
  try {
    Invoke-Checked -FilePath $npm -Arguments @(
      "ci",
      "--omit=dev",
      "--prefer-offline"
    )
  }
  finally {
    Pop-Location
  }
  Get-InstalledDevSpaceRuntimeFingerprint | Out-Null
}

function Ensure-WingetPackage {
  param(
    [Parameter(Mandatory = $true)][string] $CommandName,
    [Parameter(Mandatory = $true)][string] $PackageId,
    [Parameter(Mandatory = $true)][string] $DisplayName
  )
  if (Get-CommandPath -Name $CommandName) {
    return
  }
  if ($SkipPrerequisites) {
    throw "$DisplayName is missing and -SkipPrerequisites was supplied."
  }
  $winget = Get-CommandPath -Name "winget.exe"
  if (-not $winget) {
    throw "winget is required to install $DisplayName. Install Microsoft App Installer and rerun."
  }
  Write-Step "Installing $DisplayName"
  Invoke-Checked -FilePath $winget -Arguments @(
    "install",
    "--id", $PackageId,
    "--exact",
    "--accept-source-agreements",
    "--accept-package-agreements",
    "--silent"
  )
  Refresh-ProcessPath
  if (-not (Get-CommandPath -Name $CommandName)) {
    throw "$DisplayName was installed but is not available in this shell. Open a new terminal and rerun."
  }
}

function Ensure-Node {
  $node = Get-CommandPath -Name "node.exe"
  $supported = $false
  if ($node) {
    $rawVersion = (& $node -p "process.versions.node").Trim()
    try {
      $version = [version] $rawVersion
      $supported = $version -ge [version] "22.19.0" -and $version -lt [version] "27.0.0"
    }
    catch {
      $supported = $false
    }
  }
  if ($supported) {
    return
  }
  if ($SkipPrerequisites) {
    throw "Node >=22.19 and <27 is required."
  }
  $winget = Get-CommandPath -Name "winget.exe"
  if (-not $winget) {
    throw "winget is required to install a supported Node LTS release."
  }
  Write-Step "Installing a supported Node LTS release"
  Invoke-Checked -FilePath $winget -Arguments @(
    "install",
    "--id", "OpenJS.NodeJS.LTS",
    "--exact",
    "--accept-source-agreements",
    "--accept-package-agreements",
    "--silent"
  )
  Refresh-ProcessPath
  $node = Get-CommandPath -Name "node.exe"
  if (-not $node) {
    throw "Node was installed but is not available in this shell. Open a new terminal and rerun."
  }
  $installedVersion = [version] ((& $node -p "process.versions.node").Trim())
  if ($installedVersion -lt [version] "22.19.0" -or $installedVersion -ge [version] "27.0.0") {
    throw "Installed Node $installedVersion is outside DevSpace's supported range >=22.19 <27."
  }
}

function Find-Edge {
  $candidates = @()
  if (${env:ProgramFiles(x86)}) {
    $candidates += Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
  }
  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
  }
  if ($env:LOCALAPPDATA) {
    $candidates += Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"
  }
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return $candidate
    }
  }
  return $null
}

function Ensure-Prerequisites {
  if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw "This setup script supports Windows only."
  }
  Ensure-Node
  Ensure-WingetPackage -CommandName "git.exe" -PackageId "Git.Git" -DisplayName "Git for Windows"
  if ($TunnelMode -eq "QuickTunnel") {
    Ensure-WingetPackage -CommandName "cloudflared.exe" -PackageId "Cloudflare.cloudflared" -DisplayName "cloudflared"
  }
  if (-not $SkipBrowser -and -not (Find-Edge)) {
    if ($SkipPrerequisites) {
      throw "Microsoft Edge is missing and -SkipPrerequisites was supplied."
    }
    $winget = Get-CommandPath -Name "winget.exe"
    if (-not $winget) {
      throw "winget is required to install Microsoft Edge."
    }
    Write-Step "Installing Microsoft Edge"
    Invoke-Checked -FilePath $winget -Arguments @(
      "install",
      "--id", "Microsoft.Edge",
      "--exact",
      "--accept-source-agreements",
      "--accept-package-agreements",
      "--silent"
    )
    if (-not (Find-Edge)) {
      throw "Microsoft Edge was installed but was not found."
    }
  }
}

function New-PreparedDevSpacePackage {
  param([Parameter(Mandatory = $true)][string] $Root)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    throw "npm was not found after installing Node."
  }
  $packageRoot = New-UpdateTemporaryRoot
  Write-Step "Preparing the verified DevSpace checkout"
  try {
    Push-Location $Root
    try {
      Invoke-Checked -FilePath $npm -Arguments @("ci", "--include=dev") | Out-Host
      Invoke-Checked -FilePath $npm -Arguments @("run", "build") | Out-Host
    }
    finally {
      Pop-Location
    }
    $devspacePackage = New-DevSpacePackage -Root $Root -Destination $packageRoot
    return [pscustomobject]@{
      PackagePath = $devspacePackage
      TemporaryRoot = $packageRoot
    }
  }
  catch {
    $preparationFailure = $_
    try {
      Remove-UpdateTemporaryRoot -Path $packageRoot
    }
    catch {
      Write-Warning "Prepared package cleanup failed: $($_.Exception.Message)"
    }
    throw $preparationFailure
  }
}

function Install-PreparedDevSpace {
  param([Parameter(Mandatory = $true)][string] $PackagePath)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  $globalPrefix = Get-GlobalNpmPrefix
  Install-BuiltDevSpacePackage -PackagePath $PackagePath
  Invoke-Checked -FilePath $npm -Arguments @(
    "install",
    "--global",
    "--prefix", $globalPrefix,
    "@openai/codex@$CodexCliVersion"
  )
}

function Get-GlobalNpmRoot {
  return Join-Path (Get-GlobalNpmPrefix) "node_modules"
}

function Get-GlobalNpmPrefix {
  $environmentPrefix = [Environment]::GetEnvironmentVariable(
    "npm_config_prefix",
    [EnvironmentVariableTarget]::Process
  )
  if (-not [string]::IsNullOrWhiteSpace($environmentPrefix)) {
    return [System.IO.Path]::GetFullPath($environmentPrefix.Trim())
  }
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    throw "npm is not available."
  }
  $lines = @(& $npm prefix --global 2>$null)
  if ($LASTEXITCODE -ne 0 -or $lines.Count -eq 0) {
    throw "Unable to resolve the global npm prefix."
  }
  $prefix = [string] $lines[-1]
  if ([string]::IsNullOrWhiteSpace($prefix)) {
    throw "Unable to resolve the global npm prefix."
  }
  return [System.IO.Path]::GetFullPath($prefix.Trim())
}

function Get-InstalledDevSpaceRoot {
  $root = Join-Path (Get-GlobalNpmRoot) "@waishnav\devspace"
  $item = Get-Item -LiteralPath $root -Force -ErrorAction Stop
  if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
    throw "The installed DevSpace runtime is linked to a mutable source directory."
  }
  return [System.IO.Path]::GetFullPath($item.FullName)
}

function Get-ExtendedLengthPath {
  param([Parameter(Mandatory = $true)][string] $Path)
  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith("\\?\", [System.StringComparison]::Ordinal)) {
    return $fullPath
  }
  if ($fullPath.StartsWith("\\", [System.StringComparison]::Ordinal)) {
    return "\\?\UNC\" + $fullPath.Substring(2)
  }
  return "\\?\" + $fullPath
}

function Get-Sha256 {
  param([Parameter(Mandatory = $true)][string] $Path)
  $stream = $null
  $sha = $null
  try {
    $stream = New-Object System.IO.FileStream(
      (Get-ExtendedLengthPath -Path $Path),
      [System.IO.FileMode]::Open,
      [System.IO.FileAccess]::Read,
      [System.IO.FileShare]::Read
    )
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
  }
  catch {
    throw "Unable to hash the required file: $Path"
  }
  finally {
    if ($sha) {
      $sha.Dispose()
    }
    if ($stream) {
      $stream.Dispose()
    }
  }
}

function Get-InstalledDevSpaceRuntimeFingerprint {
  $root = Get-InstalledDevSpaceRoot
  $piRoot = Join-Path $root "node_modules\@earendil-works\pi-coding-agent"
  $requiredFiles = @(
    (Join-Path $root "package.json"),
    (Join-Path $root "npm-shrinkwrap.json"),
    (Join-Path $root "dist\cli.js"),
    (Join-Path $root "scripts\fix-node-pty-permissions.mjs"),
    (Join-Path $root "scripts\fix-pi-brace-expansion.mjs"),
    (Join-Path $root "scripts\fix-pi-undici.mjs"),
    (Join-Path $root "scripts\fix-codex-sdk-windows-hide.mjs"),
    (Join-Path $root "node_modules\.package-lock.json"),
    (Join-Path $piRoot "package.json"),
    (Join-Path $piRoot "npm-shrinkwrap.json")
  )
  foreach ($path in $requiredFiles) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "The installed DevSpace runtime is incomplete: $path"
    }
  }
  $requiredDirectories = @(
    (Join-Path $root "dist"),
    (Join-Path $root "node_modules\brace-expansion"),
    (Join-Path $root "node_modules\undici"),
    (Join-Path $piRoot "node_modules\brace-expansion"),
    (Join-Path $piRoot "node_modules\undici"),
    (Join-Path $root "node_modules\@openai\codex-sdk")
  )
  foreach ($path in $requiredDirectories) {
    $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if (-not $item.PSIsContainer) {
      throw "The installed DevSpace runtime directory is missing: $path"
    }
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "The installed DevSpace runtime contains a linked dependency directory: $path"
    }
  }
  $files = @(
    foreach ($path in $requiredFiles) {
      Get-Item -LiteralPath $path -Force
    }
    foreach ($path in $requiredDirectories) {
      Get-ChildItem -LiteralPath $path -Recurse -File -Force
    }
  ) | Sort-Object -Property FullName -Unique
  if (@($files).Count -lt 10) {
    throw "The installed DevSpace runtime contains no verifiable build output."
  }
  $rootPrefix = $root.TrimEnd("\") + "\"
  $entries = foreach ($file in $files) {
    if ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
      throw "Runtime fingerprint encountered a linked file."
    }
    $fullPath = [System.IO.Path]::GetFullPath($file.FullName)
    if (-not $fullPath.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "Runtime fingerprint encountered an unexpected path."
    }
    $relativePath = $fullPath.Substring($rootPrefix.Length).Replace("\", "/")
    "$relativePath|$($file.Length)|$(Get-Sha256 -Path $fullPath)"
  }
  $manifest = (@($entries) -join "`n") + "`n"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($manifest)
    $hash = $sha.ComputeHash($bytes)
  }
  finally {
    $sha.Dispose()
  }
  return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
}

function Get-InstalledDevSpaceRuntimeStatus {
  try {
    return [pscustomobject]@{
      Complete = $true
      Fingerprint = Get-InstalledDevSpaceRuntimeFingerprint
      Failure = $null
    }
  }
  catch {
    return [pscustomobject]@{
      Complete = $false
      Fingerprint = $null
      Failure = $_.Exception.Message
    }
  }
}

function Get-RuntimePackagePath {
  param([Parameter(Mandatory = $true)][string] $Hash)
  if ($Hash -notmatch "^[0-9a-f]{64}$") {
    throw "Saved runtime package hash is invalid."
  }
  return Join-Path $script:RuntimePackageDir ("devspace-" + $Hash + ".tgz")
}

function Save-RuntimePackageCache {
  param([Parameter(Mandatory = $true)][string] $PackagePath)
  $hash = Get-Sha256 -Path $PackagePath
  if (-not (Test-Path -LiteralPath $script:RuntimePackageDir -PathType Container)) {
    New-Item -ItemType Directory -Path $script:RuntimePackageDir -Force | Out-Null
  }
  $destination = Get-RuntimePackagePath -Hash $hash
  $copyRequired = -not (Test-Path -LiteralPath $destination -PathType Leaf)
  if (-not $copyRequired) {
    $copyRequired = (Get-Sha256 -Path $destination) -ne $hash
  }
  if ($copyRequired) {
    Copy-FileAtomic -SourcePath $PackagePath -DestinationPath $destination
  }
  if ((Get-Sha256 -Path $destination) -ne $hash) {
    throw "The managed runtime recovery package failed integrity verification."
  }
  return [pscustomobject]@{
    Hash = $hash
    Path = $destination
  }
}

function Get-ValidatedRuntimePackage {
  param([Parameter(Mandatory = $true)] $Settings)
  $hash = [string](Get-PropertyValue -InputObject $Settings -Name "runtimePackageSha256")
  if ($hash -notmatch "^[0-9a-f]{64}$") {
    throw "No valid managed runtime recovery package is recorded."
  }
  $path = Get-RuntimePackagePath -Hash $hash
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "The managed runtime recovery package is missing."
  }
  if ((Get-Sha256 -Path $path) -ne $hash) {
    throw "The managed runtime recovery package is corrupt."
  }
  return [pscustomobject]@{
    Hash = $hash
    Path = $path
  }
}

function Set-RuntimeRecoveryState {
  param(
    [Parameter(Mandatory = $true)][string] $PackageHash,
    [Parameter(Mandatory = $true)][string] $RuntimeFingerprint
  )
  if ($PackageHash -notmatch "^[0-9a-f]{64}$") {
    throw "Runtime package hash is invalid."
  }
  if ($RuntimeFingerprint -notmatch "^[0-9a-f]{64}$") {
    throw "Runtime fingerprint is invalid."
  }
  $settings = Read-JsonFile -Path $script:SettingsPath
  if (-not $settings) {
    throw "Portable setup settings are missing."
  }
  $settings | Add-Member -NotePropertyName "runtimePackageSha256" -NotePropertyValue $PackageHash -Force
  $settings | Add-Member -NotePropertyName "runtimeFingerprint" -NotePropertyValue $RuntimeFingerprint -Force
  Write-JsonAtomic -Path $script:SettingsPath -Value $settings
  return $settings
}

function Ensure-RuntimeRecoveryState {
  param([Parameter(Mandatory = $true)] $Settings)
  $expectedFingerprint = [string](
    Get-PropertyValue -InputObject $Settings -Name "runtimeFingerprint"
  )
  if ($expectedFingerprint -and $expectedFingerprint -notmatch "^[0-9a-f]{64}$") {
    throw "Saved runtime fingerprint is invalid."
  }
  $cached = $null
  $cacheFailure = $null
  try {
    $cached = Get-ValidatedRuntimePackage -Settings $Settings
  }
  catch {
    $cacheFailure = $_.Exception.Message
  }
  $installed = Get-InstalledDevSpaceRuntimeStatus
  if (-not $cached) {
    if (-not $installed.Complete) {
      throw (
        "The installed DevSpace runtime is damaged and no verified recovery package is available. " +
        "Installed runtime: $($installed.Failure) Recovery package: $cacheFailure"
      )
    }
    if (
      $expectedFingerprint -and
      -not [string]::Equals(
        [string] $installed.Fingerprint,
        $expectedFingerprint,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      throw (
        "The verified recovery package is unavailable and the installed runtime " +
        "does not match the saved fingerprint. Refusing to trust either copy automatically."
      )
    }
    $temporaryRoot = New-UpdateTemporaryRoot
    try {
      $packageDirectory = Join-Path $temporaryRoot "installed-package"
      New-Item -ItemType Directory -Path $packageDirectory | Out-Null
      $installedPackage = New-InstalledDevSpacePackage -Destination $packageDirectory
      $cached = Save-RuntimePackageCache -PackagePath $installedPackage
      if (-not $expectedFingerprint) {
        $expectedFingerprint = [string] $installed.Fingerprint
      }
      $Settings = Set-RuntimeRecoveryState `
        -PackageHash ([string] $cached.Hash) `
        -RuntimeFingerprint $expectedFingerprint
    }
    finally {
      Remove-UpdateTemporaryRoot -Path $temporaryRoot
    }
  }

  if (-not $expectedFingerprint -and $installed.Complete) {
    $expectedFingerprint = [string] $installed.Fingerprint
    $Settings = Set-RuntimeRecoveryState `
      -PackageHash ([string] $cached.Hash) `
      -RuntimeFingerprint $expectedFingerprint
  }
  $matches = $installed.Complete -and $expectedFingerprint -and [string]::Equals(
    [string] $installed.Fingerprint,
    $expectedFingerprint,
    [System.StringComparison]::OrdinalIgnoreCase
  )
  return [pscustomobject]@{
    Settings = $Settings
    PackageHash = [string] $cached.Hash
    PackagePath = [string] $cached.Path
    ExpectedFingerprint = $expectedFingerprint
    InstalledFingerprint = [string] $installed.Fingerprint
    InstalledMatches = [bool] $matches
    InstalledFailure = $installed.Failure
  }
}

function Repair-InstalledDevSpaceRuntime {
  param([Parameter(Mandatory = $true)] $RecoveryState)
  Install-BuiltDevSpacePackage `
    -PackagePath ([string] $RecoveryState.PackagePath) |
    Out-Null
  $fingerprint = Get-InstalledDevSpaceRuntimeFingerprint
  $expected = [string] $RecoveryState.ExpectedFingerprint
  if ($expected -and -not [string]::Equals(
      $fingerprint,
      $expected,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    throw "The recovery package restored an unexpected runtime fingerprint."
  }
  return Set-RuntimeRecoveryState `
    -PackageHash ([string] $RecoveryState.PackageHash) `
    -RuntimeFingerprint $fingerprint
}

function Get-DevSpaceCliPath {
  $path = Join-Path (Get-GlobalNpmRoot) "@waishnav\devspace\dist\cli.js"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "The installed DevSpace CLI was not found: $path"
  }
  return $path
}

function Get-CodexCliPath {
  $path = Join-Path (Get-GlobalNpmRoot) "@openai\codex\bin\codex.js"
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "The installed Codex CLI was not found: $path"
  }
  return $path
}

function Test-CodexLogin {
  $node = Get-CommandPath -Name "node.exe"
  $codexCli = Get-CodexCliPath
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $node $codexCli login status 2>&1 | Out-Null
    $loginExitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  return $loginExitCode -eq 0
}

function Ensure-CodexLogin {
  if (Test-CodexLogin) {
    Write-Host "Codex login: already authenticated"
    return
  }
  if ($SkipCodexLogin) {
    Write-Warning "Codex is not authenticated. Run: codex login"
    return
  }
  Write-Step "Signing in to Codex"
  Write-Host "Complete the official browser sign-in flow that opens next."
  $node = Get-CommandPath -Name "node.exe"
  Invoke-Checked -FilePath $node -Arguments @((Get-CodexCliPath), "login")
  if (-not (Test-CodexLogin)) {
    throw "Codex login did not complete."
  }
}

function New-OwnerToken {
  $bytes = New-Object byte[] 32
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

function Ensure-DevSpaceConfig {
  param(
    [Parameter(Mandatory = $true)][string[]] $Roots,
    [Parameter(Mandatory = $true)][int] $LocalPort,
    [string] $InitialPublicBaseUrl
  )
  if (-not (Test-Path -LiteralPath $script:DevSpaceDir)) {
    New-Item -ItemType Directory -Path $script:DevSpaceDir -Force | Out-Null
  }

  $existingAuth = Read-JsonFile -Path $script:DevSpaceAuthPath
  $ownerToken = $null
  $existingOwnerToken = $null
  if ($existingAuth) {
    $ownerTokenProperty = $existingAuth.PSObject.Properties["ownerToken"]
    if ($ownerTokenProperty) {
      $existingOwnerToken = [string]$ownerTokenProperty.Value
    }
  }
  if ($existingOwnerToken -and $existingOwnerToken.Length -ge 16) {
    $ownerToken = $existingOwnerToken
  }
  else {
    $ownerToken = New-OwnerToken
    Write-JsonAtomic -Path $script:DevSpaceAuthPath -Value ([ordered]@{
      ownerToken = $ownerToken
    })
  }

  $origin = $InitialPublicBaseUrl
  if (-not $origin) {
    $origin = "https://pending.invalid"
  }
  $config = Read-JsonFile -Path $script:DevSpaceConfigPath
  if (-not $config) {
    $config = New-Object psobject
  }
  foreach ($entry in @(
      @{ Name = "host"; Value = "127.0.0.1" },
      @{ Name = "port"; Value = $LocalPort },
      @{ Name = "allowedRoots"; Value = @($Roots) },
      @{ Name = "publicBaseUrl"; Value = $origin },
      @{ Name = "subagents"; Value = $true }
    )) {
    $propertyName = [string]$entry["Name"]
    $propertyValue = $entry["Value"]

    $existingProperty = $config.PSObject.Properties[$propertyName]
    if ($existingProperty) {
      $existingProperty.Value = $propertyValue
    }
    else {
      $config | Add-Member -NotePropertyName $propertyName -NotePropertyValue $propertyValue
    }
  }
  Write-JsonAtomic -Path $script:DevSpaceConfigPath -Value $config
}

function Write-ManagedProfile {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Content
  )
  if (Test-Path -LiteralPath $Path) {
    $existing = Read-Utf8Text -Path $Path
    if (-not $existing.Contains($script:ManagedProfileMarker)) {
      Write-Warning "Preserving unmanaged agent profile: $Path"
      return
    }
  }
  Write-Utf8NoBom -Path $Path -Content ($Content.Trim() + "`n")
}

function Install-AgentProfiles {
  param([Parameter(Mandatory = $true)][string] $Model)
  $profileDir = Join-Path $script:DevSpaceDir "agents"
  if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
  }

  $explorer = @"
---
schema: devspace-agent/v1
name: codex-explorer
description: Luna investigator at max reasoning for read-only research and implementation planning.
provider: codex
model: gpt-5.6-luna
thinking: max
---

$script:ManagedProfileMarker

Investigate the requested question without modifying files.

- Separate observed facts from hypotheses.
- Cite relevant files and symbols.
- Compare materially different explanations when uncertainty remains.
- Return the current best explanation, evidence, and unresolved risks.
"@

  $implementer = @"
---
schema: devspace-agent/v1
name: codex-implementer
description: Codex worker for focused implementation with clear acceptance criteria.
provider: codex
model: $Model
thinking: medium
---

$script:ManagedProfileMarker

Implement the requested change in the current workspace.

- Read the applicable project instructions before editing.
- Keep the change within the stated scope.
- Preserve unrelated user changes.
- Run focused verification for changed behavior.
- Report changed files, verification results, blockers, and remaining risks.
"@

  $reviewer = @"
---
schema: devspace-agent/v1
name: codex-reviewer
description: Codex reviewer for correctness, security, regressions, and missing verification.
provider: codex
model: $Model
thinking: high
---

$script:ManagedProfileMarker

Review the requested scope without modifying files.

- Prioritize correctness, security, data loss, permission, and regression risks.
- Cite exact evidence for each finding.
- Do not invent requirements or block on style preferences.
- Return findings by severity, then state whether any blocking defect remains.
"@

  $highImplementer = @"
---
schema: devspace-agent/v1
name: codex-implementer-high
description: Sol worker at high reasoning for difficult focused implementation tasks.
provider: codex
model: $Model
thinking: high
---

$script:ManagedProfileMarker

Implement the requested change in the current workspace.

- Read the applicable project instructions before editing.
- Use this profile only when the task needs high reasoning.
- Keep the change within the stated scope.
- Preserve unrelated user changes.
- Run focused verification for changed behavior.
- Report changed files, verification results, blockers, and remaining risks.
"@

  $xhighImplementer = @"
---
schema: devspace-agent/v1
name: codex-implementer-xhigh
description: Sol worker at xhigh reasoning for the hardest focused implementation tasks.
provider: codex
model: $Model
thinking: xhigh
---

$script:ManagedProfileMarker

Implement the requested change in the current workspace.

- Read the applicable project instructions before editing.
- Use this profile only when the task needs xhigh reasoning.
- Keep the change within the stated scope.
- Preserve unrelated user changes.
- Run focused verification for changed behavior.
- Report changed files, verification results, blockers, and remaining risks.
"@

  Write-ManagedProfile -Path (Join-Path $profileDir "codex-explorer.md") -Content $explorer
  Write-ManagedProfile -Path (Join-Path $profileDir "codex-implementer.md") -Content $implementer
  Write-ManagedProfile -Path (Join-Path $profileDir "codex-implementer-high.md") -Content $highImplementer
  Write-ManagedProfile -Path (Join-Path $profileDir "codex-implementer-xhigh.md") -Content $xhighImplementer
  Write-ManagedProfile -Path (Join-Path $profileDir "codex-reviewer.md") -Content $reviewer
}

function ConvertTo-TomlBasicString {
  param([Parameter(Mandatory = $true)][string] $Value)
  $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
  return '"' + $escaped + '"'
}

function Assert-CodexConfigParses {
  $node = Get-CommandPath -Name "node.exe"
  $codexCli = Get-CodexCliPath
  $previousErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $node $codexCli mcp list 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $previousErrorPreference
  }
  if ($exitCode -ne 0) {
    throw "Codex rejected the updated MCP configuration: $output"
  }
}

function Write-CodexConfigAtomic {
  param(
    [Parameter(Mandatory = $true)][string] $Path,
    [Parameter(Mandatory = $true)][string] $Content
  )
  $directory = Split-Path -Parent $Path
  $id = [Guid]::NewGuid().ToString("N")
  $temporaryPath = Join-Path $directory ".config-devspace-$id.tmp"
  $backupPath = Join-Path $directory ".config-devspace-$id.backup"
  $hadExistingConfig = Test-Path -LiteralPath $Path -PathType Leaf
  $replacementInstalled = $false

  try {
    Write-Utf8NoBom -Path $temporaryPath -Content $Content
    if ($hadExistingConfig) {
      [System.IO.File]::Replace($temporaryPath, $Path, $backupPath, $true)
    }
    else {
      Move-Item -LiteralPath $temporaryPath -Destination $Path
    }
    $replacementInstalled = $true

    Assert-CodexConfigParses

    if (Test-Path -LiteralPath $backupPath) {
      Remove-Item -LiteralPath $backupPath -Force
    }
  }
  catch {
    if ($replacementInstalled) {
      if (Test-Path -LiteralPath $backupPath) {
        [System.IO.File]::Replace($backupPath, $Path, $null, $true)
      }
      elseif (-not $hadExistingConfig -and (Test-Path -LiteralPath $Path)) {
        Remove-Item -LiteralPath $Path -Force
      }
    }
    throw
  }
  finally {
    if (Test-Path -LiteralPath $temporaryPath) {
      Remove-Item -LiteralPath $temporaryPath -Force
    }
  }
}

function Install-PlaywrightMcp {
  $node = Get-CommandPath -Name "node.exe"
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  $configPath = Join-Path $script:CodexDir "config.toml"
  $existingConfig = ""
  if (Test-Path -LiteralPath $configPath) {
    $existingConfig = Read-Utf8Text -Path $configPath
  }
  $managedPattern =
    "(?ms)^\s*" + [regex]::Escape($script:PlaywrightBlockBegin) +
    ".*?^\s*" + [regex]::Escape($script:PlaywrightBlockEnd) + "\s*(?:\r?\n)?"
  $withoutManagedBlock = [regex]::Replace($existingConfig, $managedPattern, "")
  if ([regex]::IsMatch(
      $withoutManagedBlock,
      "(?m)^\s*\[mcp_servers\.playwright\]\s*$"
    )) {
    Write-Warning (
      "An unmanaged [mcp_servers.playwright] section already exists; " +
      "preserving its config and runtime without changes."
    )
    return
  }

  $playwrightDir = Join-Path $script:CodexDir "mcp\playwright"
  $outputDir = Join-Path $script:CodexDir "browser-output\playwright-mcp"
  $launcherPath = Join-Path $playwrightDir "start-managed-edge.ps1"
  foreach ($directory in @($script:CodexDir, $playwrightDir, $outputDir)) {
    if (-not (Test-Path -LiteralPath $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
  }

  $package = [ordered]@{
    name = "codex-playwright-mcp-runtime"
    version = "1.0.0"
    private = $true
    description = "Pinned local runtime for the Microsoft Playwright MCP server."
    dependencies = [ordered]@{
      "@playwright/mcp" = $PlaywrightMcpVersion
    }
  }
  Write-JsonAtomic -Path (Join-Path $playwrightDir "package.json") -Value $package
  Invoke-Checked -FilePath $npm -Arguments @(
    "install",
    "--prefix", $playwrightDir,
    "--no-fund",
    "--no-audit"
  )

  $launcher = @'
$ErrorActionPreference = "Stop"

$edgeCandidates = @()
if (${env:ProgramFiles(x86)}) {
  $edgeCandidates += Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"
}
if ($env:ProgramFiles) {
  $edgeCandidates += Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"
}
if ($env:LOCALAPPDATA) {
  $edgeCandidates += Join-Path $env:LOCALAPPDATA "Microsoft\Edge\Application\msedge.exe"
}
$edgePath = $edgeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $edgePath) {
  throw "Microsoft Edge was not found."
}

$profilePath = Join-Path $env:USERPROFILE ".codex\browser-profiles\playwright-mcp"
$quotedProfilePath = '"' + $profilePath.Replace('"', '\"') + '"'
$debugPort = 9222
$listener = Get-NetTCPConnection `
  -LocalAddress 127.0.0.1 `
  -LocalPort $debugPort `
  -State Listen `
  -ErrorAction SilentlyContinue

if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
  if ($owner.Name -ne "msedge.exe" -or $owner.CommandLine -notlike "*$profilePath*") {
    throw "Port $debugPort is already used by another process."
  }
  exit 0
}

$edgeArguments = @(
  "--remote-debugging-address=127.0.0.1"
  "--remote-debugging-port=$debugPort"
  "--user-data-dir=$quotedProfilePath"
  "--new-window"
  "https://dash.cloudflare.com/"
  "https://chatgpt.com/"
  "https://platform.openai.com/settings/organization/tunnels"
)

Start-Process -FilePath $edgePath -ArgumentList $edgeArguments
'@
  Write-Utf8NoBom -Path $launcherPath -Content ($launcher.Trim() + "`n")

  $playwrightCli = Join-Path $playwrightDir "node_modules\@playwright\mcp\cli.js"
  if (-not (Test-Path -LiteralPath $playwrightCli -PathType Leaf)) {
    throw "Playwright MCP CLI was not installed: $playwrightCli"
  }
  $blockLines = @(
    $script:PlaywrightBlockBegin,
    "[mcp_servers.playwright]",
    "command = $(ConvertTo-TomlBasicString -Value $node)",
    "args = [",
    "  $(ConvertTo-TomlBasicString -Value $playwrightCli),",
    "  `"--cdp-endpoint=http://127.0.0.1:9222`",",
    "  $(ConvertTo-TomlBasicString -Value ("--output-dir=" + $outputDir)),",
    "  `"--output-max-size=52428800`",",
    "  `"--console-level=warning`",",
    "]",
    "cwd = $(ConvertTo-TomlBasicString -Value $playwrightDir)",
    "enabled = true",
    "required = false",
    "default_tools_approval_mode = `"writes`"",
    $script:PlaywrightBlockEnd
  )
  $block = $blockLines -join "`r`n"
  $nextConfig = $withoutManagedBlock.TrimEnd()
  if ($nextConfig) {
    $nextConfig += "`r`n`r`n"
  }
  $nextConfig += $block + "`r`n"
  Write-CodexConfigAtomic -Path $configPath -Content $nextConfig
}

function Get-ProcessRecord {
  param([int] $ProcessId)
  if ($ProcessId -le 0) {
    return $null
  }
  return Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Get-TrackedProcessIdentity {
  param(
    [int] $ProcessId,
    [Parameter(Mandatory = $true)][string] $ExpectedCommandFragment,
    [Parameter(Mandatory = $true)][string] $ExpectedExecutablePath,
    [Parameter(Mandatory = $true)][long] $ExpectedStartTimeFileTimeUtc
  )
  $record = Get-ProcessRecord -ProcessId $ProcessId
  if (-not $record) {
    return [pscustomobject]@{
      Exists = $false
      Matches = $false
      CommandMatches = $false
      ExecutableMatches = $false
      StartTimeMatches = $false
    }
  }
  $commandLine = [string] $record.CommandLine
  $executablePath = [string] $record.ExecutablePath
  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  $actualStartTimeFileTimeUtc = if ($process) {
    $process.StartTime.ToUniversalTime().ToFileTimeUtc()
  }
  else {
    0
  }
  $commandMatches =
    $commandLine.ToLowerInvariant().Contains($ExpectedCommandFragment.ToLowerInvariant())
  $executableMatches =
    $executablePath.Equals($ExpectedExecutablePath, [System.StringComparison]::OrdinalIgnoreCase)
  $startTimeMatches = $actualStartTimeFileTimeUtc -eq $ExpectedStartTimeFileTimeUtc
  return [pscustomobject]@{
    Exists = $true
    Matches = $commandMatches -and $executableMatches -and $startTimeMatches
    CommandMatches = $commandMatches
    ExecutableMatches = $executableMatches
    StartTimeMatches = $startTimeMatches
  }
}

function Stop-TrackedProcess {
  param(
    [int] $ProcessId,
    [Parameter(Mandatory = $true)][string] $ExpectedCommandFragment,
    [Parameter(Mandatory = $true)][string] $ExpectedExecutablePath,
    [Parameter(Mandatory = $true)][long] $ExpectedStartTimeFileTimeUtc
  )
  $identity = Get-TrackedProcessIdentity `
    -ProcessId $ProcessId `
    -ExpectedCommandFragment $ExpectedCommandFragment `
    -ExpectedExecutablePath $ExpectedExecutablePath `
    -ExpectedStartTimeFileTimeUtc $ExpectedStartTimeFileTimeUtc
  if (-not $identity.Exists) {
    return $true
  }

  if (-not $identity.Matches) {
    Write-Warning (
      "Refusing to stop PID $ProcessId because its recorded process identity no longer matches " +
      "(command=$($identity.CommandMatches), executable=$($identity.ExecutableMatches), " +
      "startTime=$($identity.StartTimeMatches))."
    )
    return $false
  }
  $taskkill = Get-CommandPath -Name "taskkill.exe"
  if (-not $taskkill) {
    throw "Windows process-tree termination is unavailable."
  }
  & $taskkill /PID $ProcessId /T /F 2>&1 | Out-Null
  $stopDeadline = [DateTime]::UtcNow.AddSeconds(10)
  while (
    [DateTime]::UtcNow -lt $stopDeadline -and
    (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
  ) {
    Start-Sleep -Milliseconds 100
  }
  $stopped = -not [bool](Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
  if (-not $stopped) {
    Write-Warning "PID $ProcessId still exists after the stop timeout; runtime state will be preserved."
  }
  return $stopped
}

function Test-LocalDevSpaceHealth {
  param([Parameter(Mandatory = $true)][int] $Port)
  try {
    $response = Invoke-WebRequest `
      -UseBasicParsing `
      -Uri "http://127.0.0.1:$Port/healthz" `
      -Headers @{
        Accept = "application/json"
        "User-Agent" = "DevSpace-Windows-Setup/1.0"
      } `
      -TimeoutSec 3
    return [int]$response.StatusCode -eq 200
  }
  catch {
    return $false
  }
}

function Get-HealthyManagedRuntime {
  param(
    [Parameter(Mandatory = $true)] $Settings,
    [string] $InstalledFingerprint
  )
  $runtime = Read-JsonFile -Path $script:RuntimeStatePath
  if (-not $runtime) {
    return $null
  }
  if ([string](Get-PropertyValue -InputObject $runtime -Name "schema") -ne "devspace-windows-runtime/v3") {
    return $null
  }
  $expectedFingerprint = [string](
    Get-PropertyValue -InputObject $Settings -Name "runtimeFingerprint"
  )
  $expectedPackageHash = [string](
    Get-PropertyValue -InputObject $Settings -Name "runtimePackageSha256"
  )
  if (
    $expectedFingerprint -notmatch "^[0-9a-f]{64}$" -or
    $expectedPackageHash -notmatch "^[0-9a-f]{64}$"
  ) {
    return $null
  }
  if (-not $InstalledFingerprint) {
    try {
      $InstalledFingerprint = Get-InstalledDevSpaceRuntimeFingerprint
    }
    catch {
      return $null
    }
  }
  if (
    -not [string]::Equals(
      $InstalledFingerprint,
      $expectedFingerprint,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string](Get-PropertyValue -InputObject $runtime -Name "devspaceRuntimeFingerprint"),
      $expectedFingerprint,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string](Get-PropertyValue -InputObject $runtime -Name "runtimePackageSha256"),
      $expectedPackageHash,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return $null
  }
  try {
    $currentCli = [System.IO.Path]::GetFullPath((Get-DevSpaceCliPath))
    $recordedCli = [string](Get-PropertyValue -InputObject $runtime -Name "devspaceCommandFragment")
    if (-not $recordedCli) {
      return $null
    }
    $recordedCli = [System.IO.Path]::GetFullPath($recordedCli)
    if (-not [string]::Equals(
        $currentCli,
        $recordedCli,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
      return $null
    }
  }
  catch {
    return $null
  }
  $identity = Get-TrackedProcessIdentity `
    -ProcessId ([int](Get-PropertyValue -InputObject $runtime -Name "devspacePid")) `
    -ExpectedCommandFragment ([string](Get-PropertyValue -InputObject $runtime -Name "devspaceCommandFragment")) `
    -ExpectedExecutablePath ([string](Get-PropertyValue -InputObject $runtime -Name "devspaceExecutablePath")) `
    -ExpectedStartTimeFileTimeUtc ([long](Get-PropertyValue -InputObject $runtime -Name "devspaceStartTimeFileTimeUtc"))
  if (-not $identity.Exists -or -not $identity.Matches) {
    return $null
  }
  if (-not (Test-LocalDevSpaceHealth -Port ([int] $Settings.port))) {
    return $null
  }
  try {
    $runtimeOrigin = Normalize-HttpsOrigin -Value ([string](
        Get-PropertyValue -InputObject $runtime -Name "publicBaseUrl"
      ))
    $expectedOrigin = if ([string] $Settings.tunnelMode -eq "External") {
      Normalize-HttpsOrigin -Value ([string] $Settings.publicBaseUrl)
    }
    else {
      $runtimeOrigin
    }
    if (-not [string]::Equals(
        $runtimeOrigin,
        $expectedOrigin,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
      return $null
    }
    $config = Read-JsonFile -Path $script:DevSpaceConfigPath
    if (-not $config) {
      return $null
    }
    $configOrigin = Normalize-HttpsOrigin -Value ([string] $config.publicBaseUrl)
    if (-not [string]::Equals(
        $configOrigin,
        $expectedOrigin,
        [System.StringComparison]::OrdinalIgnoreCase
      )) {
      return $null
    }
    Test-OAuthMetadata `
      -Origin "http://127.0.0.1:$([int] $Settings.port)" `
      -ExpectedPublicOrigin $expectedOrigin `
      -TimeoutSeconds 3
  }
  catch {
    return $null
  }
  return [pscustomobject]@{
    PublicBaseUrl = $expectedOrigin
    DevSpacePid = [int](Get-PropertyValue -InputObject $runtime -Name "devspacePid")
    CloudflaredPid = Get-PropertyValue -InputObject $runtime -Name "cloudflaredPid"
    Reused = $true
  }
}

function Stop-DevSpaceRuntime {
  $runtime = Read-JsonFile -Path $script:RuntimeStatePath
  if (-not $runtime) {
    Write-Host "No managed DevSpace runtime is recorded."
    return
  }
  $allStopped = $true
  $cloudflaredPid = Get-PropertyValue -InputObject $runtime -Name "cloudflaredPid"
  if ($cloudflaredPid) {
    $cloudflaredStopped = Stop-TrackedProcess `
      -ProcessId ([int] $cloudflaredPid) `
      -ExpectedCommandFragment ([string] (
        Get-PropertyValue -InputObject $runtime -Name "cloudflaredCommandFragment"
      )) `
      -ExpectedExecutablePath ([string] (
        Get-PropertyValue -InputObject $runtime -Name "cloudflaredExecutablePath"
      )) `
      -ExpectedStartTimeFileTimeUtc ([long] (
        Get-PropertyValue -InputObject $runtime -Name "cloudflaredStartTimeFileTimeUtc"
      ))
    $allStopped = $allStopped -and $cloudflaredStopped
  }
  $devspacePid = Get-PropertyValue -InputObject $runtime -Name "devspacePid"
  if ($devspacePid) {
    $devspaceStopped = Stop-TrackedProcess `
      -ProcessId ([int] $devspacePid) `
      -ExpectedCommandFragment ([string] (
        Get-PropertyValue -InputObject $runtime -Name "devspaceCommandFragment"
      )) `
      -ExpectedExecutablePath ([string] (
        Get-PropertyValue -InputObject $runtime -Name "devspaceExecutablePath"
      )) `
      -ExpectedStartTimeFileTimeUtc ([long] (
        Get-PropertyValue -InputObject $runtime -Name "devspaceStartTimeFileTimeUtc"
      ))
    $allStopped = $allStopped -and $devspaceStopped
  }
  if ($allStopped -and (Test-Path -LiteralPath $script:RuntimeStatePath)) {
    Remove-Item -LiteralPath $script:RuntimeStatePath -Force
    Write-Host "Managed DevSpace processes stopped."
    return
  }
  throw "One or more recorded processes could not be safely identified. Runtime state was preserved."
}

function Get-TcpListeners {
  param([Parameter(Mandatory = $true)][int] $LocalPort)
  return @(
    Get-NetTCPConnection `
      -LocalPort $LocalPort `
      -State Listen `
      -ErrorAction SilentlyContinue
  )
}

function Assert-TcpPortAvailable {
  param([Parameter(Mandatory = $true)][int] $LocalPort)
  $listeners = @(Get-TcpListeners -LocalPort $LocalPort)
  if ($listeners.Count -gt 0) {
    $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
    throw "Port $LocalPort is already used by PID(s): $($owners -join ', '). Nothing was exposed."
  }
}

function Wait-ForOwnedTcpPort {
  param(
    [Parameter(Mandatory = $true)][int] $LocalPort,
    [Parameter(Mandatory = $true)][int] $ExpectedProcessId,
    [int] $TimeoutSeconds = 20
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    $listeners = @(Get-TcpListeners -LocalPort $LocalPort)
    if ($listeners.Count -gt 0) {
      if ($listeners | Where-Object { [int] $_.OwningProcess -eq $ExpectedProcessId }) {
        return $true
      }
      $owners = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)
      throw "Port $LocalPort was claimed by unexpected PID(s): $($owners -join ', ')."
    }
    if (-not (Get-Process -Id $ExpectedProcessId -ErrorAction SilentlyContinue)) {
      return $false
    }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

function Update-PublicBaseUrl {
  param([Parameter(Mandatory = $true)][string] $Origin)
  $config = Read-JsonFile -Path $script:DevSpaceConfigPath
  if (-not $config) {
    throw "DevSpace config is missing: $script:DevSpaceConfigPath"
  }
  $config.publicBaseUrl = $Origin
  Write-JsonAtomic -Path $script:DevSpaceConfigPath -Value $config
}

function Start-QuickTunnel {
  param([Parameter(Mandatory = $true)][int] $LocalPort)
  $cloudflared = Get-CommandPath -Name "cloudflared.exe"
  if (-not $cloudflared) {
    throw "cloudflared is not installed."
  }
  $cloudflaredConfigDir = Join-Path $env:USERPROFILE ".cloudflared"
  $conflictingConfigs = @(
    (Join-Path $cloudflaredConfigDir "config.yml"),
    (Join-Path $cloudflaredConfigDir "config.yaml")
  ) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  if (@($conflictingConfigs).Count -gt 0) {
    throw (
      "Cloudflare Quick Tunnels do not run while a .cloudflared config file is present. " +
      "Use -TunnelMode External or temporarily move: $($conflictingConfigs -join ', ')"
    )
  }
  if (-not (Test-Path -LiteralPath $script:LogDir)) {
    New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
  }
  $stdoutPath = Join-Path $script:LogDir "cloudflared.out.log"
  $stderrPath = Join-Path $script:LogDir "cloudflared.err.log"
  foreach ($path in @($stdoutPath, $stderrPath)) {
    Rotate-LogFile -Path $path
  }
  $process = Start-Process `
    -FilePath $cloudflared `
    -ArgumentList @(
      "tunnel",
      "--url", "http://127.0.0.1:$LocalPort",
      "--no-autoupdate"
    ) `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -PassThru

  try {
    $origin = $null
    for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
      if ($process.HasExited) {
        break
      }
      $combined = ""
      foreach ($path in @($stdoutPath, $stderrPath)) {
        if (Test-Path -LiteralPath $path) {
          $combined += Read-Utf8TextShared -Path $path
        }
      }
      $match = [regex]::Match($combined, "https://[a-z0-9-]+\.trycloudflare\.com")
      if ($match.Success) {
        $origin = $match.Value
        break
      }
      Start-Sleep -Milliseconds 500
    }
    if (-not $origin) {
      throw "cloudflared did not produce a Quick Tunnel URL. Check $stderrPath"
    }
    return [pscustomobject]@{
      Process = $process
      Origin = $origin
    }
  }
  catch {
    if (-not $process.HasExited) {
      Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
      $process.WaitForExit(5000) | Out-Null
    }
    throw
  }
}

function Start-DevSpaceRuntime {
  param(
    [Parameter(Mandatory = $true)] $Settings,
    [switch] $ForceRestart,
    [switch] $RepairAttempted
  )
  $repairWasAttempted = [bool] $RepairAttempted
  $recoveryState = Ensure-RuntimeRecoveryState -Settings $Settings
  $Settings = $recoveryState.Settings
  if (-not $ForceRestart -and $recoveryState.InstalledMatches) {
    $existing = Get-HealthyManagedRuntime `
      -Settings $Settings `
      -InstalledFingerprint ([string] $recoveryState.InstalledFingerprint)
    if ($existing) {
      Write-Host "DevSpace is already healthy; preserving the current MCP sessions."
      return $existing
    }
  }
  Stop-DevSpaceRuntime
  if (-not $recoveryState.InstalledMatches) {
    Write-Step "Repairing the installed DevSpace runtime from the verified local package"
    $Settings = Repair-InstalledDevSpaceRuntime -RecoveryState $recoveryState
    $repairWasAttempted = $true
    $recoveryState = Ensure-RuntimeRecoveryState -Settings $Settings
    if (-not $recoveryState.InstalledMatches) {
      throw "The installed DevSpace runtime still fails integrity verification after repair."
    }
  }
  $localPort = [int] $Settings.port
  Assert-TcpPortAvailable -LocalPort $localPort

  if (-not (Test-Path -LiteralPath $script:LogDir)) {
    New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
  }

  $cloudflaredProcess = $null
  $devspaceProcess = $null
  $node = Get-CommandPath -Name "node.exe"
  $devspaceCli = Get-DevSpaceCliPath
  $stdoutPath = Join-Path $script:LogDir "devspace.out.log"
  $stderrPath = Join-Path $script:LogDir "devspace.err.log"
  foreach ($path in @($stdoutPath, $stderrPath)) {
    Rotate-LogFile -Path $path
  }

  try {
    if ($Settings.tunnelMode -eq "QuickTunnel") {
      Write-Step "Starting a Cloudflare Quick Tunnel"
      $tunnel = Start-QuickTunnel -LocalPort $localPort
      $cloudflaredProcess = $tunnel.Process
      $origin = $tunnel.Origin
    }
    else {
      $origin = Normalize-HttpsOrigin -Value ([string] $Settings.publicBaseUrl)
    }
    Update-PublicBaseUrl -Origin $origin

    $previousTrustProxy = $env:DEVSPACE_TRUST_PROXY
    $previousRequestLogging = $env:DEVSPACE_LOG_REQUESTS
    $previousToolCallLogging = $env:DEVSPACE_LOG_TOOL_CALLS
    $env:DEVSPACE_TRUST_PROXY = "1"
    $env:DEVSPACE_LOG_REQUESTS = "0"
    $env:DEVSPACE_LOG_TOOL_CALLS = "0"
    try {
      $quotedCli = '"' + $devspaceCli.Replace('"', '\"') + '"'
      $devspaceProcess = Start-Process `
        -FilePath $node `
        -ArgumentList @($quotedCli, "serve") `
        -WorkingDirectory ([string] $Settings.sourceRoot) `
        -WindowStyle Hidden `
        -RedirectStandardOutput $stdoutPath `
        -RedirectStandardError $stderrPath `
        -PassThru
    }
    finally {
      $env:DEVSPACE_TRUST_PROXY = $previousTrustProxy
      $env:DEVSPACE_LOG_REQUESTS = $previousRequestLogging
      $env:DEVSPACE_LOG_TOOL_CALLS = $previousToolCallLogging
    }

    if (-not (Wait-ForOwnedTcpPort `
          -LocalPort $localPort `
          -ExpectedProcessId $devspaceProcess.Id)) {
      throw "DevSpace did not claim port $localPort. Check $stderrPath"
    }

    $runtimeFingerprint = Get-InstalledDevSpaceRuntimeFingerprint
    $runtime = [ordered]@{
      schema = "devspace-windows-runtime/v3"
      devspacePid = $devspaceProcess.Id
      devspaceExecutablePath = $node
      devspaceCommandFragment = $devspaceCli
      devspaceStartTimeFileTimeUtc = $devspaceProcess.StartTime.ToUniversalTime().ToFileTimeUtc()
      devspaceRuntimeFingerprint = $runtimeFingerprint
      runtimePackageSha256 = [string](
        Get-PropertyValue -InputObject $Settings -Name "runtimePackageSha256"
      )
      cloudflaredPid = if ($cloudflaredProcess) { $cloudflaredProcess.Id } else { $null }
      cloudflaredExecutablePath = if ($cloudflaredProcess) {
        Get-CommandPath -Name "cloudflared.exe"
      }
      else {
        $null
      }
      cloudflaredCommandFragment = if ($cloudflaredProcess) {
        "http://127.0.0.1:$localPort"
      }
      else {
        $null
      }
      cloudflaredStartTimeFileTimeUtc = if ($cloudflaredProcess) {
        $cloudflaredProcess.StartTime.ToUniversalTime().ToFileTimeUtc()
      }
      else {
        $null
      }
      publicBaseUrl = $origin
      startedAt = [DateTime]::UtcNow.ToString("o")
    }
    Write-JsonAtomic -Path $script:RuntimeStatePath -Value $runtime
    return [pscustomobject]@{
      PublicBaseUrl = $origin
      DevSpacePid = $devspaceProcess.Id
      CloudflaredPid = if ($cloudflaredProcess) { $cloudflaredProcess.Id } else { $null }
      Reused = $false
    }
  }
  catch {
    $launchFailure = $_
    if ($devspaceProcess -and -not $devspaceProcess.HasExited) {
      Stop-Process -Id $devspaceProcess.Id -ErrorAction SilentlyContinue
      Wait-Process -Id $devspaceProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    if ($cloudflaredProcess -and -not $cloudflaredProcess.HasExited) {
      Stop-Process -Id $cloudflaredProcess.Id -ErrorAction SilentlyContinue
      Wait-Process -Id $cloudflaredProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    if (-not $repairWasAttempted -and $devspaceProcess) {
      Write-Warning "DevSpace failed to start from an intact-looking installation; restoring the verified local package once."
      $Settings = Repair-InstalledDevSpaceRuntime -RecoveryState $recoveryState
      return Start-DevSpaceRuntime `
        -Settings $Settings `
        -ForceRestart `
        -RepairAttempted
    }
    throw $launchFailure
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
  $expectedOrigin = Normalize-HttpsOrigin -Value $ExpectedPublicOrigin
  $requestOrigin = $Origin.TrimEnd("/")
  $authorizationMetadataUri = $requestOrigin + "/.well-known/oauth-authorization-server"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $authorizationMetadataUri -Headers @{
    Accept = "application/json"
    "User-Agent" = "DevSpace-Windows-Setup/1.0"
  } -TimeoutSec $TimeoutSeconds
  if ([int] $response.StatusCode -ne 200) {
    throw "OAuth metadata returned HTTP $($response.StatusCode): $authorizationMetadataUri"
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
      throw "OAuth metadata is missing $fieldName`: $authorizationMetadataUri"
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
  $protectedResponse = Invoke-WebRequest -UseBasicParsing -Uri $protectedResourceUri -Headers @{
    Accept = "application/json"
    "User-Agent" = "DevSpace-Windows-Setup/1.0"
  } -TimeoutSec $TimeoutSeconds
  if ([int] $protectedResponse.StatusCode -ne 200) {
    throw "OAuth protected-resource metadata returned HTTP $($protectedResponse.StatusCode): $protectedResourceUri"
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

function Test-CodexDelegation {
  param(
    [Parameter(Mandatory = $true)][string] $Root,
    [Parameter(Mandatory = $true)][string] $Model
  )
  if (-not (Test-CodexLogin)) {
    Write-Warning "Skipping Codex delegation test because Codex is not authenticated."
    return
  }
  $node = Get-CommandPath -Name "node.exe"
  $devspaceCli = Get-DevSpaceCliPath
  $package = Read-Utf8Text -Path (Join-Path $Root "package.json") | ConvertFrom-Json
  $expected = "$($package.name) $($package.version)"
  Push-Location $Root
  try {
    $launchOutput = & $node $devspaceCli agents run codex-explorer --model $Model `
      "Read package.json and report only the package name and version. Do not modify files." 2>&1 |
      Out-String
    if ($LASTEXITCODE -ne 0) {
      throw "Codex subagent launch failed: $launchOutput"
    }
    $runMatch = [regex]::Match($launchOutput, "\bagt_[a-f0-9]+\b")
    if (-not $runMatch.Success) {
      throw "Codex subagent did not return a run ID: $launchOutput"
    }
    $runId = $runMatch.Value
    $result = ""
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
      $result = & $node $devspaceCli agents show $runId 2>&1 | Out-String
      if ($LASTEXITCODE -eq 0 -and
          $result.Contains(" idle ") -and
          $result.Contains([string] $package.name) -and
          $result.Contains([string] $package.version)) {
        Write-Host "Codex delegation: pass ($runId -> $expected)"
        return
      }
      if ($result.Contains(" error ")) {
        throw "Codex subagent failed: $result"
      }
      Start-Sleep -Seconds 2
    }
    throw "Codex subagent did not finish within 60 seconds: $runId"
  }
  finally {
    Pop-Location
  }
}

function Invoke-SetupVerification {
  param(
    [Parameter(Mandatory = $true)] $Settings,
    [Parameter(Mandatory = $true)][string] $Origin
  )
  Write-Step "Verifying the installation"
  $node = Get-CommandPath -Name "node.exe"
  Invoke-Checked -FilePath $node -Arguments @((Get-DevSpaceCliPath), "doctor")
  Test-OAuthMetadata `
    -Origin "http://127.0.0.1:$($Settings.port)" `
    -ExpectedPublicOrigin $Origin
  Test-OAuthMetadata -Origin $Origin -ExpectedPublicOrigin $Origin
  Test-CodexDelegation -Root ([string] $Settings.sourceRoot) -Model ([string] $Settings.codexModel)
  Write-Host "OAuth metadata: local and public pass"
}

function Start-ManagedBrowser {
  $launcher = Join-Path $script:CodexDir "mcp\playwright\start-managed-edge.ps1"
  if (-not (Test-Path -LiteralPath $launcher)) {
    throw "Managed Edge launcher is missing: $launcher"
  }
  $powershell = Get-CommandPath -Name "pwsh.exe"
  if (-not $powershell) {
    $powershell = Get-CommandPath -Name "powershell.exe"
  }
  Start-Process -FilePath $powershell -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"' + $launcher.Replace('"', '\"') + '"')
  ) -WindowStyle Hidden
}

function Show-Plan {
  param(
    [Parameter(Mandatory = $true)][string] $Root,
    [Parameter(Mandatory = $true)][string[]] $Roots
  )
  $installList = "Node LTS (if needed), Git (if needed), Edge (if needed), DevSpace checkout, Codex CLI, Playwright MCP"
  $externalActions = "Package downloads; Codex browser login; ChatGPT/Cloudflare/OpenAI pages"
  if ($TunnelMode -eq "QuickTunnel") {
    $installList += ", cloudflared"
    $externalActions += "; Quick Tunnel"
  }
  [pscustomobject]@{
    Mode = "Plan"
    SourceRoot = $Root
    AllowedRoots = $Roots -join ", "
    Port = $Port
    TunnelMode = $TunnelMode
    PublicBaseUrl = $PublicBaseUrl
    CodexModel = $CodexModel
    CodexCliVersion = $CodexCliVersion
    PlaywrightMcpVersion = $PlaywrightMcpVersion
    Installs = $installList
    Writes = "$script:DevSpaceDir and $script:CodexDir managed Playwright block"
    ExternalActions = $externalActions
    AutomaticStartup = "not registered here; optional External-mode recovery has a separate Plan and Install"
    Credentials = "new per-PC Owner token; existing valid local token preserved; no token copied or printed"
  } | Format-List
}

function Invoke-StartMode {
  $savedSettings = Read-JsonFile -Path $script:SettingsPath
  if (-not $savedSettings) {
    throw "Portable setup settings are missing. Run this script in Install mode first."
  }
  if ($RecoveryStart) {
    if ((Get-DesiredRuntimeState -Settings $savedSettings) -ne "running") {
      Write-Host "Recovery start skipped: DevSpace is intentionally stopped."
      return $null
    }
  }
  else {
    $savedSettings = Set-DesiredRuntimeState -State "running"
  }

  $runtime = Start-DevSpaceRuntime -Settings $savedSettings
  try {
    if (-not $SkipVerification) {
      Invoke-SetupVerification -Settings $savedSettings -Origin $runtime.PublicBaseUrl
    }
    if (-not $SkipBrowser -and -not $SkipBrowserLaunch) {
      Start-ManagedBrowser
    }
  }
  catch {
    $startFailure = $_
    if (-not $runtime.Reused) {
      try {
        Stop-DevSpaceRuntime
      }
      catch {
        Write-Warning "Automatic rollback could not stop every recorded process: $($_.Exception.Message)"
      }
    }
    else {
      Write-Warning "Start verification failed; preserving the pre-existing healthy runtime."
    }
    throw $startFailure
  }
  return $runtime
}

function Assert-UpdatePlanStillCurrent {
  param([Parameter(Mandatory = $true)] $Plan)
  $currentPlan = Get-SourceUpdatePlanWithoutFetch -Plan $Plan
  if (
    $currentPlan.FromCommit -ne $Plan.FromCommit -or
    $currentPlan.TargetCommit -ne $Plan.TargetCommit
  ) {
    Throw-UpdateFailure -Code "SOURCE_CHANGED_DURING_PREFLIGHT" -Message (
      "The managed source changed while the candidate was being verified."
    )
  }
}

function Get-SourceUpdatePlanWithoutFetch {
  param([Parameter(Mandatory = $true)] $Plan)
  $git = [string] $Plan.Git
  $root = [string] $Plan.Root
  $branch = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $root, "branch", "--show-current"
  )
  $dirty = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $root, "status", "--porcelain", "--untracked-files=normal"
  )
  if ($branch -ne "main" -or $dirty) {
    Throw-UpdateFailure -Code "SOURCE_CHANGED_DURING_PREFLIGHT" -Message (
      "The managed main checkout changed while the candidate was being verified."
    )
  }
  $originUrl = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $root, "remote", "get-url", "origin"
  )
  if (-not [string]::Equals(
      $originUrl.TrimEnd("/"),
      $script:CanonicalOriginUrl.TrimEnd("/"),
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
    Throw-UpdateFailure -Code "SOURCE_CHANGED_DURING_PREFLIGHT" -Message (
      "The managed origin changed while the candidate was being verified."
    )
  }
  return [pscustomobject]@{
    FromCommit = Invoke-CapturedChecked -FilePath $git -Arguments @(
      "-C", $root, "rev-parse", "HEAD^{commit}"
    )
    TargetCommit = Invoke-CapturedChecked -FilePath $git -Arguments @(
      "-C", $root, "rev-parse", "refs/remotes/origin/main^{commit}"
    )
  }
}

function Invoke-UpdateRuntimeVerification {
  param(
    [Parameter(Mandatory = $true)] $Settings,
    [Parameter(Mandatory = $true)][string] $Origin,
    [Parameter(Mandatory = $true)][string] $CandidateRoot
  )
  $node = Get-CommandPath -Name "node.exe"
  Invoke-Checked -FilePath $node -Arguments @((Get-DevSpaceCliPath), "doctor")
  Test-OAuthMetadata `
    -Origin "http://127.0.0.1:$($Settings.port)" `
    -ExpectedPublicOrigin $Origin
  Test-OAuthMetadata -Origin $Origin -ExpectedPublicOrigin $Origin
  if (-not $SkipVerification) {
    Test-CodexDelegation `
      -Root $CandidateRoot `
      -Model ([string] $Settings.codexModel)
  }
}

function Restore-UpdateDeployment {
  param(
    [Parameter(Mandatory = $true)] $Plan,
    [Parameter(Mandatory = $true)][string] $PreviousDesiredState,
    [Parameter(Mandatory = $true)][string] $RollbackPackage,
    [Parameter(Mandatory = $true)][string] $SettingsBackup,
    [Parameter(Mandatory = $true)][string] $SetupBackup,
    [string] $RecoveryBackup,
    [Parameter(Mandatory = $true)][bool] $HadRecovery
  )
  try {
    Stop-DevSpaceRuntime
  }
  catch {
    Write-Warning "Rollback could not stop the candidate runtime: $($_.Exception.Message)"
  }

  $git = [string] $Plan.Git
  $root = [string] $Plan.Root
  $head = Invoke-CapturedChecked -FilePath $git -Arguments @(
    "-C", $root, "rev-parse", "HEAD^{commit}"
  )
  if ($head -ne [string] $Plan.FromCommit) {
    Invoke-Checked -FilePath $git -Arguments @(
      "-C", $root, "reset", "--hard", ([string] $Plan.FromCommit)
    )
  }

  Install-BuiltDevSpacePackage -PackagePath $RollbackPackage
  Copy-FileAtomic -SourcePath $SettingsBackup -DestinationPath $script:SettingsPath
  Copy-FileAtomic -SourcePath $SetupBackup -DestinationPath $script:ManagedScriptPath
  if ($HadRecovery) {
    Copy-FileAtomic -SourcePath $RecoveryBackup -DestinationPath $script:ManagedRecoveryPath
  }

  if ($PreviousDesiredState -eq "running") {
    $restoredSettings = Read-JsonFile -Path $script:SettingsPath
    $runtime = Start-DevSpaceRuntime -Settings $restoredSettings -ForceRestart
    $node = Get-CommandPath -Name "node.exe"
    Invoke-Checked -FilePath $node -Arguments @((Get-DevSpaceCliPath), "doctor")
    Test-OAuthMetadata `
      -Origin "http://127.0.0.1:$($restoredSettings.port)" `
      -ExpectedPublicOrigin $runtime.PublicBaseUrl
    Test-OAuthMetadata `
      -Origin $runtime.PublicBaseUrl `
      -ExpectedPublicOrigin $runtime.PublicBaseUrl
  }
  else {
    Set-DesiredRuntimeState -State "stopped" | Out-Null
  }
}

function Invoke-UpdateMode {
  $requestId = $UpdateRequestId
  if (-not $requestId) {
    $requestId = [Guid]::NewGuid().ToString()
  }
  $startedAt = [DateTime]::UtcNow.ToString("o")
  $updateMutex = Enter-UpdateOperation
  $temporaryRoot = $null
  $worktreePath = $null
  $plan = $null
  $runtimeMutex = $null
  $deploymentStarted = $false
  try {
    Write-UpdateStatus `
      -State "preflight" `
      -RequestId $requestId `
      -StartedAt $startedAt
    $settings = Read-JsonFile -Path $script:SettingsPath
    if (-not $settings) {
      Throw-UpdateFailure -Code "PORTABLE_SETTINGS_MISSING" -Message (
        "Portable setup settings are missing."
      )
    }
    if ([string] $settings.tunnelMode -ne "External") {
      Throw-UpdateFailure -Code "STABLE_ENDPOINT_REQUIRED" -Message (
        "ChatGPT-initiated updates require an External stable endpoint."
      )
    }
    $root = Resolve-SourceRoot -RequestedRoot ([string] $settings.sourceRoot)
    $plan = Get-SourceUpdatePlan -Root $root
    Write-UpdateStatus `
      -State "preflight" `
      -RequestId $requestId `
      -FromCommit ([string] $plan.FromCommit) `
      -TargetCommit ([string] $plan.TargetCommit) `
      -StartedAt $startedAt
    if ($plan.FromCommit -eq $plan.TargetCommit) {
      Write-UpdateStatus `
        -State "up_to_date" `
        -RequestId $requestId `
        -FromCommit ([string] $plan.FromCommit) `
        -TargetCommit ([string] $plan.TargetCommit) `
        -StartedAt $startedAt `
        -Code "UP_TO_DATE"
      return
    }

    $temporaryRoot = New-UpdateTemporaryRoot
    $worktreePath = Join-Path $temporaryRoot "candidate"
    $candidatePackagePath = Join-Path $temporaryRoot "candidate-package"
    $backupPath = Join-Path $temporaryRoot "rollback"
    New-Item -ItemType Directory -Path $candidatePackagePath | Out-Null
    New-Item -ItemType Directory -Path $backupPath | Out-Null
    Add-UpdateWorktree -Plan $plan -Path $worktreePath
    Invoke-UpdatePreflight -Root $worktreePath

    $candidatePackage = New-DevSpacePackage `
      -Root $worktreePath `
      -Destination $candidatePackagePath
    $candidateRecoveryPackage = Save-RuntimePackageCache -PackagePath $candidatePackage
    $rollbackPackage = $null
    $settingsBackup = Join-Path $backupPath "windows-bootstrap.previous.json"
    $setupBackup = Join-Path $backupPath "setup-windows.previous.ps1"
    $hadRecovery = $false
    $recoveryBackup = $null

    $runtimeMutex = Enter-RuntimeOperation
    Assert-UpdatePlanStillCurrent -Plan $plan
    $settings = Read-JsonFile -Path $script:SettingsPath
    if (
      -not $settings -or
      [string] $settings.tunnelMode -ne "External" -or
      -not [string]::Equals(
        [System.IO.Path]::GetFullPath([string] $settings.sourceRoot),
        [string] $plan.Root,
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      Throw-UpdateFailure -Code "SETTINGS_CHANGED_DURING_PREFLIGHT" -Message (
        "Portable setup settings changed while the candidate was being verified."
      )
    }
    $rollbackPackage = New-InstalledDevSpaceRollbackPackage -Destination $backupPath
    Copy-FileAtomic -SourcePath $script:SettingsPath -DestinationPath $settingsBackup
    Copy-FileAtomic -SourcePath $script:ManagedScriptPath -DestinationPath $setupBackup
    $hadRecovery = Test-Path -LiteralPath $script:ManagedRecoveryPath -PathType Leaf
    if ($hadRecovery) {
      $recoveryBackup = Join-Path $backupPath "setup-windows-recovery.previous.ps1"
      Copy-FileAtomic -SourcePath $script:ManagedRecoveryPath -DestinationPath $recoveryBackup
    }
    $previousDesiredState = Get-DesiredRuntimeState -Settings $settings
    Write-UpdateStatus `
      -State "applying" `
      -RequestId $requestId `
      -FromCommit ([string] $plan.FromCommit) `
      -TargetCommit ([string] $plan.TargetCommit) `
      -StartedAt $startedAt
    $deploymentStarted = $true
    try {
      Stop-DevSpaceRuntime
      Install-BuiltDevSpacePackage -PackagePath $candidatePackage
      $candidateFingerprint = Get-InstalledDevSpaceRuntimeFingerprint
      $settings = Set-RuntimeRecoveryState `
        -PackageHash ([string] $candidateRecoveryPackage.Hash) `
        -RuntimeFingerprint $candidateFingerprint

      if ($previousDesiredState -eq "running") {
        $runtime = Start-DevSpaceRuntime -Settings $settings -ForceRestart
        Invoke-UpdateRuntimeVerification `
          -Settings $settings `
          -Origin $runtime.PublicBaseUrl `
          -CandidateRoot $worktreePath
      }
      else {
        $node = Get-CommandPath -Name "node.exe"
        Invoke-Checked -FilePath $node -Arguments @((Get-DevSpaceCliPath), "doctor")
      }

      Sync-ManagedSetupScript -SourcePath (Join-Path $worktreePath "scripts\setup-windows.ps1")
      Sync-ManagedRecoveryScript `
        -SourcePath (Join-Path $worktreePath "scripts\setup-windows-recovery.ps1")
      Invoke-Checked -FilePath ([string] $plan.Git) -Arguments @(
        "-C", ([string] $plan.Root),
        "merge", "--ff-only", ([string] $plan.TargetCommit)
      )
      $updatedHead = Invoke-CapturedChecked -FilePath ([string] $plan.Git) -Arguments @(
        "-C", ([string] $plan.Root), "rev-parse", "HEAD^{commit}"
      )
      if ($updatedHead -ne [string] $plan.TargetCommit) {
        throw "The managed source did not reach the verified target commit."
      }
    }
    catch {
      $applyFailure = $_
      try {
        Restore-UpdateDeployment `
          -Plan $plan `
          -PreviousDesiredState $previousDesiredState `
          -RollbackPackage $rollbackPackage `
          -SettingsBackup $settingsBackup `
          -SetupBackup $setupBackup `
          -RecoveryBackup $recoveryBackup `
          -HadRecovery $hadRecovery
        Write-UpdateStatus `
          -State "rolled_back" `
          -RequestId $requestId `
          -FromCommit ([string] $plan.FromCommit) `
          -TargetCommit ([string] $plan.TargetCommit) `
          -StartedAt $startedAt `
          -Code "APPLY_FAILED_ROLLED_BACK"
        Throw-UpdateFailure -Code "APPLY_FAILED_ROLLED_BACK" -Message (
          "The candidate failed during deployment and the previous installation was restored."
        )
      }
      catch {
        $rollbackFailure = $_
        if ((Get-UpdateFailureCode -ErrorRecord $rollbackFailure) -eq "APPLY_FAILED_ROLLED_BACK") {
          throw $rollbackFailure
        }
        Write-UpdateStatus `
          -State "failed" `
          -RequestId $requestId `
          -FromCommit ([string] $plan.FromCommit) `
          -TargetCommit ([string] $plan.TargetCommit) `
          -StartedAt $startedAt `
          -Code "ROLLBACK_FAILED"
        throw "Update failed: $($applyFailure.Exception.Message); rollback failed: $($rollbackFailure.Exception.Message)"
      }
    }

    Write-UpdateStatus `
      -State "succeeded" `
      -RequestId $requestId `
      -FromCommit ([string] $plan.FromCommit) `
      -TargetCommit ([string] $plan.TargetCommit) `
      -StartedAt $startedAt `
      -Code "SUCCEEDED"
  }
  catch {
    $failure = $_
    $code = Get-UpdateFailureCode -ErrorRecord $failure
    if (-not $deploymentStarted) {
      if (-not $code) {
        $code = "PREFLIGHT_FAILED"
      }
      Write-UpdateStatus `
        -State "rejected" `
        -RequestId $requestId `
        -FromCommit $(if ($plan) { [string] $plan.FromCommit } else { $null }) `
        -TargetCommit $(if ($plan) { [string] $plan.TargetCommit } else { $null }) `
        -StartedAt $startedAt `
        -Code $code
    }
    throw
  }
  finally {
    if ($runtimeMutex) {
      Exit-RuntimeOperation -Mutex $runtimeMutex
    }
    if ($worktreePath -and $plan) {
      try {
        Remove-UpdateWorktree -Plan $plan -Path $worktreePath
      }
      catch {
        Write-Warning "Update worktree cleanup failed: $($_.Exception.Message)"
      }
    }
    if ($temporaryRoot) {
      try {
        Remove-UpdateTemporaryRoot -Path $temporaryRoot
      }
      catch {
        Write-Warning "Update temporary cleanup failed: $($_.Exception.Message)"
      }
    }
    Exit-RuntimeOperation -Mutex $updateMutex
  }
}

function Invoke-UpdateLaunchMode {
  if (-not $UpdateRequestId) {
    throw "-UpdateRequestId is required for the internal update launcher."
  }
  $settings = Read-JsonFile -Path $script:SettingsPath
  if (-not $settings -or -not [string] $settings.sourceRoot) {
    throw "Portable setup settings are missing."
  }
  $powershell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
  if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) {
    throw "Windows PowerShell is not available."
  }
  $workingDirectory = [System.IO.Path]::GetFullPath([string] $settings.sourceRoot)
  if (-not (Test-Path -LiteralPath $workingDirectory -PathType Container)) {
    throw "The managed source checkout is unavailable."
  }
  New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
  $stdoutPath = Join-Path $script:LogDir "windows-update.out.log"
  $stderrPath = Join-Path $script:LogDir "windows-update.err.log"
  $arguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "`"$PSCommandPath`"",
    "-Mode",
    "Update",
    "-UpdateRequestId",
    $UpdateRequestId
  )
  if ($SkipVerification) {
    $arguments += "-SkipVerification"
  }
  $argumentLine = $arguments -join " "
  Start-Process `
    -FilePath $powershell `
    -ArgumentList $argumentLine `
    -WorkingDirectory $workingDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath | Out-Null
}

if ($Mode -eq "Stop") {
  $runtimeMutex = Enter-RuntimeOperation
  try {
    Set-DesiredRuntimeState -State "stopped" | Out-Null
    Stop-DevSpaceRuntime
  }
  finally {
    Exit-RuntimeOperation -Mutex $runtimeMutex
  }
  exit 0
}

if ($Mode -eq "Start") {
  $runtimeMutex = Enter-RuntimeOperation
  try {
    $runtime = Invoke-StartMode
  }
  finally {
    Exit-RuntimeOperation -Mutex $runtimeMutex
  }
  if ($runtime) {
    Write-Host ""
    Write-Host "DevSpace MCP: $($runtime.PublicBaseUrl)/mcp" -ForegroundColor Green
  }
  exit 0
}

if ($Mode -eq "Update") {
  Invoke-UpdateMode
  exit 0
}

if ($Mode -eq "LaunchUpdate") {
  Invoke-UpdateLaunchMode
  exit 0
}

$resolvedSourceRoot = Resolve-SourceRoot -RequestedRoot $SourceRoot
$resolvedAllowedRoots = Resolve-AllowedRoots -RequestedRoots $AllowedRoot -DefaultRoot $resolvedSourceRoot

if ($TunnelMode -eq "External") {
  if (-not $PublicBaseUrl) {
    throw "-PublicBaseUrl is required when -TunnelMode External is used."
  }
  $PublicBaseUrl = Normalize-HttpsOrigin -Value $PublicBaseUrl
}

if ($Mode -eq "Plan") {
  Show-Plan -Root $resolvedSourceRoot -Roots $resolvedAllowedRoots
  exit 0
}

$runtimeMutex = Enter-RuntimeOperation
$preparedInstallation = $null
try {
Write-Step "Checking prerequisites"
Ensure-Prerequisites
$preparedInstallation = New-PreparedDevSpacePackage -Root $resolvedSourceRoot
$preparedRecoveryPackage = Save-RuntimePackageCache `
  -PackagePath $preparedInstallation.PackagePath

Write-Step "Creating per-PC DevSpace configuration"
$initialOrigin = if ($TunnelMode -eq "External") { $PublicBaseUrl } else { $null }
Ensure-DevSpaceConfig `
  -Roots $resolvedAllowedRoots `
  -LocalPort $Port `
  -InitialPublicBaseUrl $initialOrigin

$settings = [ordered]@{
  schema = "devspace-windows-bootstrap/v1"
  sourceRoot = $resolvedSourceRoot
  allowedRoots = @($resolvedAllowedRoots)
  port = $Port
  tunnelMode = $TunnelMode
  publicBaseUrl = $initialOrigin
  desiredState = "stopped"
  codexModel = $CodexModel
  codexCliVersion = $CodexCliVersion
  playwrightMcpVersion = $PlaywrightMcpVersion
}

Set-DesiredRuntimeState -State "stopped" | Out-Null
Stop-DevSpaceRuntime
Install-PreparedDevSpace -PackagePath $preparedInstallation.PackagePath
$settings["runtimePackageSha256"] = [string] $preparedRecoveryPackage.Hash
$settings["runtimeFingerprint"] = Get-InstalledDevSpaceRuntimeFingerprint
Install-AgentProfiles -Model $CodexModel
Ensure-CodexLogin
if (-not $SkipBrowser) {
  Write-Step "Installing Playwright MCP and the dedicated Edge launcher"
  Install-PlaywrightMcp
}
Write-JsonAtomic -Path $script:SettingsPath -Value $settings
Sync-ManagedSetupScript -SourcePath $PSCommandPath
if ($TunnelMode -eq "External") {
  Sync-ManagedRecoveryScript `
    -SourcePath (Join-Path $resolvedSourceRoot "scripts\setup-windows-recovery.ps1")
}
$settingsForStart = Set-DesiredRuntimeState -State "running"

Write-Step "Starting DevSpace"
$runtime = Start-DevSpaceRuntime -Settings $settingsForStart -ForceRestart
try {
  if (-not $SkipVerification) {
    Invoke-SetupVerification -Settings $settingsForStart -Origin $runtime.PublicBaseUrl
  }
  if (-not $SkipBrowser -and -not $SkipBrowserLaunch) {
    Start-ManagedBrowser
  }
}
catch {
  $installFailure = $_
  try {
    Stop-DevSpaceRuntime
    Set-DesiredRuntimeState -State "stopped" | Out-Null
  }
  catch {
    Write-Warning "Automatic rollback could not stop every recorded process: $($_.Exception.Message)"
  }
  throw $installFailure
}

Write-Host ""
Write-Host "Portable DevSpace setup is ready." -ForegroundColor Green
Write-Host "MCP URL: $($runtime.PublicBaseUrl)/mcp"
Write-Host "Owner password file: $script:DevSpaceAuthPath"
Write-Host "Start later: & `"$script:ManagedScriptPath`" -Mode Start"
Write-Host "Stop:        & `"$script:ManagedScriptPath`" -Mode Stop"
if ($TunnelMode -eq "External") {
  $recoveryScript = Join-Path $resolvedSourceRoot "scripts\setup-windows-recovery.ps1"
  Write-Host "Recovery preview: & `"$recoveryScript`" -Mode Plan"
}
Write-Host ""
Write-Host "In ChatGPT Developer mode, create or update the DevSpace app with the MCP URL above."
Write-Host "Quick Tunnel URLs change after tunnel restart. Use -TunnelMode External with a stable HTTPS origin for permanent use."
}
finally {
  if ($preparedInstallation) {
    try {
      Remove-UpdateTemporaryRoot -Path $preparedInstallation.TemporaryRoot
    }
    catch {
      Write-Warning "Prepared package cleanup failed: $($_.Exception.Message)"
    }
  }
  Exit-RuntimeOperation -Mutex $runtimeMutex
}
