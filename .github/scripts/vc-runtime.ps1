# Helpers for shipping the MSVC runtime beside the engine.
#
# The engine links whisper.cpp / ONNX Runtime against the DLL CRT
# (MSVCP140, VCRUNTIME140…), which a clean Windows install doesn't have.
# Microsoft allows app-local deployment of these DLLs, so they ride along in
# resources\ next to digiclip.exe (the loader searches the exe's dir first).

function Get-VsPath {
    $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
    $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $vs) { throw 'Visual Studio with the C++ toolset not found' }
    return $vs
}

function Get-Dumpbin {
    $d = Get-ChildItem (Join-Path (Get-VsPath) 'VC\Tools\MSVC\*\bin\Hostx64\x64\dumpbin.exe') | Select-Object -Last 1
    if (-not $d) { throw 'dumpbin.exe not found' }
    return $d.FullName
}

# MSVC runtime DLLs an exe imports (msvcp140*, vcruntime140*, vcomp140…).
function Get-CrtImports([string] $Exe) {
    & (Get-Dumpbin) /nologo /dependents $Exe |
        Select-String -Pattern '^\s+((msvcp|vcruntime|vcomp|concrt)\S*\.dll)' |
        ForEach-Object { $_.Matches[0].Groups[1].Value.ToLower() } | Sort-Object -Unique
}

# Copy exactly the runtime DLLs $Exe imports from the VS redist into $Dest.
function Copy-CrtFor([string] $Exe, [string] $Dest) {
    $crt = Get-ChildItem (Join-Path (Get-VsPath) 'VC\Redist\MSVC\*\x64\Microsoft.VC*.CRT') -Directory |
        Sort-Object FullName | Select-Object -Last 1
    $omp = Get-ChildItem (Join-Path (Get-VsPath) 'VC\Redist\MSVC\*\x64\Microsoft.VC*.OpenMP') -Directory -ErrorAction SilentlyContinue |
        Sort-Object FullName | Select-Object -Last 1
    if (-not $crt) { throw 'MSVC redist CRT folder not found' }
    foreach ($dll in (Get-CrtImports $Exe)) {
        $src = @($crt, $omp) | Where-Object { $_ } | ForEach-Object { Join-Path $_.FullName $dll } |
            Where-Object { Test-Path $_ } | Select-Object -First 1
        if (-not $src) { throw "$dll (imported by $Exe) not found in the VS redist" }
        Copy-Item $src $Dest -Force
        Write-Host "bundled $dll"
    }
}
