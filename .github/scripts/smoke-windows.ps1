# End-to-end install check for a packed DigiClip Setup (Windows):
#   payload version -> headless install -> files, registry, shortcuts ->
#   the installed app boots its bundled engine -> the registered
#   uninstaller removes everything.
#
#   smoke-windows.ps1 -Setup <DigiClip-Setup-Windows-x64.exe> -Version <x.y.z>
param(
    [Parameter(Mandatory)] [string] $Setup,
    [Parameter(Mandatory)] [string] $Version
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'vc-runtime.ps1')
function Fail($msg) { Write-Host "::error::$msg"; exit 1 }

# Setup is a GUI-subsystem exe: Start-Process is the reliable way to get its
# exit code and redirected stdout. WaitForExit, not -Wait: -Wait also waits
# for every descendant (e.g. the detached uninstall worker, a launched app).
function Invoke-Setup([string[]] $SetupArgs, [int] $Expect = 0) {
    $out = New-TemporaryFile; $err = New-TemporaryFile
    $p = Start-Process -FilePath $Setup -ArgumentList $SetupArgs -PassThru -NoNewWindow `
        -RedirectStandardOutput $out -RedirectStandardError $err
    $null = $p.Handle # cache the handle so ExitCode survives the exit
    if (-not $p.WaitForExit(300000)) { $p.Kill(); Fail "Setup $($SetupArgs -join ' ') hung" }
    $text = (Get-Content $out -Raw) + (Get-Content $err -Raw)
    Write-Host "> DigiClip-Setup $($SetupArgs -join ' ') [exit $($p.ExitCode)]`n$text"
    if ($p.ExitCode -ne $Expect) { Fail "Setup $($SetupArgs -join ' ') exited $($p.ExitCode)" }
    return (Get-Content $out -Raw)
}

$Setup = (Resolve-Path $Setup).Path
$dir = Join-Path $env:LOCALAPPDATA 'DigiClip'
$key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DigiClip'

Write-Host '== payload'
$info = (Invoke-Setup @('--payload-info')).Trim()
if ($info.Split(' ')[0] -ne $Version) { Fail "Setup carries '$info', expected $Version" }

Write-Host '== install'
Invoke-Setup @('--install') | Out-Null
$detect = Invoke-Setup @('--detect')
if ($detect -notmatch "installed=true version=$([regex]::Escape($Version)) ") { Fail "detect after install: $detect" }

foreach ($f in @('digiclip-app.exe', 'resources\digiclip.exe', 'DigiClip-Setup.exe')) {
    if (-not (Test-Path (Join-Path $dir $f))) { Fail "missing $dir\$f" }
}
if (Test-Path (Join-Path $dir 'DigiClip\digiclip-app.exe')) { Fail 'app installed one folder too deep' }

# The engine needs the VC++ runtime; it must ship beside it (clean PCs
# have no redistributable installed).
$engine = Join-Path $dir 'resources\digiclip.exe'
$imports = @(Get-CrtImports $engine)
foreach ($dll in $imports) {
    if (-not (Test-Path (Join-Path $dir "resources\$dll"))) { Fail "engine imports $dll but it is not bundled" }
}
Write-Host "engine CRT imports bundled: $($imports -join ', ')"

$uninstaller = Get-Item (Join-Path $dir 'DigiClip-Setup.exe')
if ($uninstaller.Length -ge (Get-Item $Setup).Length) { Fail 'uninstaller copy still carries the payload' }

$reg = Get-ItemProperty $key
if ($reg.DisplayVersion -ne $Version) { Fail "registry DisplayVersion=$($reg.DisplayVersion)" }
if ($reg.InstallLocation -ne $dir) { Fail "registry InstallLocation=$($reg.InstallLocation)" }
if ($reg.UninstallString -notlike "*$dir\DigiClip-Setup.exe*--uninstall") { Fail "registry UninstallString=$($reg.UninstallString)" }
$startLink = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\DigiClip.lnk'
if (-not (Test-Path $startLink)) { Fail 'Start Menu shortcut missing' }

& $engine --version
if ($LASTEXITCODE -ne 0) { Fail "engine --version exited $LASTEXITCODE" }

Write-Host '== launch installed app (engine boot check)'
$report = Join-Path ([IO.Path]::GetTempPath()) 'digiclip-smoke.txt'
Remove-Item $report -ErrorAction SilentlyContinue
$env:DIGICLIP_SMOKE_TEST = $report
$app = Start-Process -FilePath (Join-Path $dir 'digiclip-app.exe') -PassThru
if (-not $app.WaitForExit(120000)) { $app.Kill(); Fail 'installed app did not finish booting in 120s' }
Remove-Item Env:\DIGICLIP_SMOKE_TEST
if (-not (Test-Path $report)) { Fail 'installed app never reported (did not boot)' }
$line = Get-Content $report -Raw
Write-Host $line
if ($line -notmatch '^ok ') { Fail 'installed app could not boot its engine' }

Write-Host '== uninstall (registered uninstaller)'
$exe, $rest = ($reg.QuietUninstallString -split '"' | Where-Object { $_.Trim() })
$u = Start-Process -FilePath $exe -ArgumentList ($rest.Trim() -split ' ') -PassThru
if (-not $u.WaitForExit(60000)) { Fail 'registered uninstaller hung' }
for ($i = 0; $i -lt 60 -and (Test-Path $dir); $i++) { Start-Sleep -Milliseconds 500 }
if (Test-Path $dir) { Fail "install dir left behind: $(Get-ChildItem -Recurse $dir | Out-String)" }
if (Test-Path $key) { Fail 'uninstall registry key left behind' }
if (Test-Path $startLink) { Fail 'Start Menu shortcut left behind' }
Write-Host 'smoke OK'
