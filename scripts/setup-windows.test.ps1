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
        "Get-PropertyValue",
        "Normalize-HttpsOrigin",
        "Sync-ManagedSetupScript",
        "Test-OAuthMetadata",
        "New-OwnerToken",
        "ConvertTo-TomlBasicString",
        "Get-ProcessRecord",
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
        (Get-SetupFunctionSource -Names @("Read-Utf8TextShared"))
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
  function Invoke-WebRequest {
    param(
      [switch] $UseBasicParsing,
      [string] $Uri,
      [hashtable] $Headers
    )
    $script:capturedOAuthHeaders = $Headers
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
  $mainInstallIndex = $sourceText.LastIndexOf("Install-DevSpace -Root `$resolvedSourceRoot")
  $mainStopIndex = $sourceText.LastIndexOf("Stop-DevSpaceRuntime", $mainInstallIndex)
  Assert-True `
    -Condition ($mainStopIndex -ge 0 -and $mainStopIndex -lt $mainInstallIndex) `
    -Message "Install mode does not stop the managed runtime before replacing dependencies."
  Assert-True `
    -Condition $sourceText.Contains('"--allow-scripts=@waishnav/devspace"') `
    -Message "Global DevSpace install does not explicitly allow its reviewed postinstall repairs."

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

  $script:RuntimeStatePath = Join-Path $temporaryRoot "runtime.json"
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
