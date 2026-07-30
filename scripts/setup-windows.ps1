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
#>

[CmdletBinding()]
param(
  [ValidateSet("Install", "Start", "Stop", "Plan")]
  [string] $Mode = "Install",

  [string] $SourceRoot,

  [string[]] $AllowedRoot,

  [ValidateRange(1, 65535)]
  [int] $Port = 7676,

  [ValidateSet("QuickTunnel", "External")]
  [string] $TunnelMode = "QuickTunnel",

  [string] $PublicBaseUrl,

  [string] $CodexModel = "gpt-5.5",

  [string] $CodexCliVersion = "0.145.0",

  [string] $PlaywrightMcpVersion = "0.0.78",

  [switch] $SkipPrerequisites,

  [switch] $SkipCodexLogin,

  [switch] $SkipBrowser,

  [switch] $SkipBrowserLaunch,

  [switch] $SkipVerification
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
$script:LogDir = Join-Path $script:DevSpaceDir "logs"

function Write-Step {
  param([string] $Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Sync-ManagedSetupScript {
  param([Parameter(Mandatory = $true)][string] $SourcePath)
  $resolvedSource = [System.IO.Path]::GetFullPath($SourcePath)
  $resolvedDestination = [System.IO.Path]::GetFullPath($script:ManagedScriptPath)
  if (
    [string]::Equals(
      $resolvedSource,
      $resolvedDestination,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return
  }
  Copy-Item -LiteralPath $resolvedSource -Destination $resolvedDestination -Force
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

function Install-DevSpace {
  param([Parameter(Mandatory = $true)][string] $Root)
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    throw "npm was not found after installing Node."
  }
  Write-Step "Installing the verified DevSpace checkout"
  Push-Location $Root
  try {
    Invoke-Checked -FilePath $npm -Arguments @("ci", "--include=dev")
    Invoke-Checked -FilePath $npm -Arguments @("run", "build")
    Invoke-Checked -FilePath $npm -Arguments @("install", "--global", ".")
    Invoke-Checked -FilePath $npm -Arguments @(
      "install",
      "--global",
      "@openai/codex@$CodexCliVersion"
    )
  }
  finally {
    Pop-Location
  }
}

function Get-GlobalNpmRoot {
  $npm = Get-CommandPath -Name "npm.cmd"
  if (-not $npm) {
    $npm = Get-CommandPath -Name "npm"
  }
  if (-not $npm) {
    throw "npm is not available."
  }
  $root = (& $npm root --global | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $root) {
    throw "Unable to resolve the global npm root."
  }
  return $root
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
description: Codex investigator for read-only repository research and implementation planning.
provider: codex
model: $Model
thinking: medium
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

  Write-ManagedProfile -Path (Join-Path $profileDir "codex-explorer.md") -Content $explorer
  Write-ManagedProfile -Path (Join-Path $profileDir "codex-implementer.md") -Content $implementer
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

function Stop-TrackedProcess {
  param(
    [int] $ProcessId,
    [Parameter(Mandatory = $true)][string] $ExpectedCommandFragment,
    [Parameter(Mandatory = $true)][string] $ExpectedExecutablePath,
    [Parameter(Mandatory = $true)][long] $ExpectedStartTimeFileTimeUtc
  )
  $record = Get-ProcessRecord -ProcessId $ProcessId
  if (-not $record) {
    return $true
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
  $identityMatches = $commandMatches -and $executableMatches -and $startTimeMatches

  if (-not $identityMatches) {
    Write-Warning (
      "Refusing to stop PID $ProcessId because its recorded process identity no longer matches " +
      "(command=$commandMatches, executable=$executableMatches, startTime=$startTimeMatches)."
    )
    return $false
  }
  Stop-Process -Id $ProcessId -ErrorAction Stop
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
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
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
  param([Parameter(Mandatory = $true)] $Settings)
  Stop-DevSpaceRuntime
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
    if (Test-Path -LiteralPath $path) {
      Remove-Item -LiteralPath $path -Force
    }
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
    $env:DEVSPACE_TRUST_PROXY = "1"
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
    }

    if (-not (Wait-ForOwnedTcpPort `
          -LocalPort $localPort `
          -ExpectedProcessId $devspaceProcess.Id)) {
      throw "DevSpace did not claim port $localPort. Check $stderrPath"
    }

    $runtime = [ordered]@{
      schema = "devspace-windows-runtime/v2"
      devspacePid = $devspaceProcess.Id
      devspaceExecutablePath = $node
      devspaceCommandFragment = $devspaceCli
      devspaceStartTimeFileTimeUtc = $devspaceProcess.StartTime.ToUniversalTime().ToFileTimeUtc()
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
    }
  }
  catch {
    if ($devspaceProcess -and -not $devspaceProcess.HasExited) {
      Stop-Process -Id $devspaceProcess.Id -ErrorAction SilentlyContinue
      Wait-Process -Id $devspaceProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    if ($cloudflaredProcess -and -not $cloudflaredProcess.HasExited) {
      Stop-Process -Id $cloudflaredProcess.Id -ErrorAction SilentlyContinue
      Wait-Process -Id $cloudflaredProcess.Id -Timeout 10 -ErrorAction SilentlyContinue
    }
    throw
  }
}

function Test-OAuthMetadata {
  param([Parameter(Mandatory = $true)][string] $Origin)
  $uri = $Origin.TrimEnd("/") + "/.well-known/oauth-authorization-server"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $uri -Headers @{
    Accept = "application/json"
    "User-Agent" = "DevSpace-Windows-Setup/1.0"
  }
  if ([int] $response.StatusCode -ne 200) {
    throw "OAuth metadata returned HTTP $($response.StatusCode): $uri"
  }
  $metadata = $response.Content | ConvertFrom-Json
  if (-not $metadata.authorization_endpoint -or -not $metadata.token_endpoint) {
    throw "OAuth metadata is incomplete: $uri"
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
  Test-OAuthMetadata -Origin "http://127.0.0.1:$($Settings.port)"
  Test-OAuthMetadata -Origin $Origin
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

if ($Mode -eq "Stop") {
  Stop-DevSpaceRuntime
  exit 0
}

if ($Mode -eq "Start") {
  $savedSettings = Read-JsonFile -Path $script:SettingsPath
  if (-not $savedSettings) {
    throw "Portable setup settings are missing. Run this script in Install mode first."
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
    try {
      Stop-DevSpaceRuntime
    }
    catch {
      Write-Warning "Automatic rollback could not stop every recorded process: $($_.Exception.Message)"
    }
    throw $startFailure
  }
  Write-Host ""
  Write-Host "DevSpace MCP: $($runtime.PublicBaseUrl)/mcp" -ForegroundColor Green
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

Write-Step "Checking prerequisites"
Ensure-Prerequisites
Stop-DevSpaceRuntime
Install-DevSpace -Root $resolvedSourceRoot
Ensure-CodexLogin

Write-Step "Creating per-PC DevSpace configuration"
$initialOrigin = if ($TunnelMode -eq "External") { $PublicBaseUrl } else { $null }
Ensure-DevSpaceConfig `
  -Roots $resolvedAllowedRoots `
  -LocalPort $Port `
  -InitialPublicBaseUrl $initialOrigin
Install-AgentProfiles -Model $CodexModel

if (-not $SkipBrowser) {
  Write-Step "Installing Playwright MCP and the dedicated Edge launcher"
  Install-PlaywrightMcp
}

$settings = [ordered]@{
  schema = "devspace-windows-bootstrap/v1"
  sourceRoot = $resolvedSourceRoot
  allowedRoots = @($resolvedAllowedRoots)
  port = $Port
  tunnelMode = $TunnelMode
  publicBaseUrl = $initialOrigin
  codexModel = $CodexModel
  codexCliVersion = $CodexCliVersion
  playwrightMcpVersion = $PlaywrightMcpVersion
}
Write-JsonAtomic -Path $script:SettingsPath -Value $settings
Sync-ManagedSetupScript -SourcePath $PSCommandPath

Write-Step "Starting DevSpace"
$runtime = Start-DevSpaceRuntime -Settings ([pscustomobject] $settings)
try {
  if (-not $SkipVerification) {
    Invoke-SetupVerification -Settings ([pscustomobject] $settings) -Origin $runtime.PublicBaseUrl
  }
  if (-not $SkipBrowser -and -not $SkipBrowserLaunch) {
    Start-ManagedBrowser
  }
}
catch {
  $installFailure = $_
  try {
    Stop-DevSpaceRuntime
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
