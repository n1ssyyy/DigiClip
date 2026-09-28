# Authenticode-sign files with the release certificate.
#
#   sign-windows.ps1 -Files a.exe,b.exe            # WINDOWS_CERT_PFX (base64) + WINDOWS_CERT_PASSWORD
#   sign-windows.ps1 -Files a.exe -Throwaway       # self-signed test cert, for CI self-tests only
#
# SHA-256 file digest, RFC 3161 timestamp (the signature outlives the cert).
param(
    [Parameter(Mandatory)] [string[]] $Files,
    [switch] $Throwaway
)
$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Host "::error::$msg"; exit 1 }

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { Fail 'signtool.exe not found (Windows 10 SDK)' }

$pfx = Join-Path $env:RUNNER_TEMP "sign-$([guid]::NewGuid()).pfx"
try {
    if ($Throwaway) {
        $password = [guid]::NewGuid().ToString()
        $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject 'CN=DigiClip CI self-test' `
            -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddDays(1)
        Export-PfxCertificate -Cert $cert -FilePath $pfx `
            -Password (ConvertTo-SecureString $password -AsPlainText -Force) | Out-Null
        Remove-Item "Cert:\CurrentUser\My\$($cert.Thumbprint)"
    } else {
        if (-not $env:WINDOWS_CERT_PFX) { Fail 'WINDOWS_CERT_PFX is not set' }
        [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:WINDOWS_CERT_PFX))
        $password = $env:WINDOWS_CERT_PASSWORD
    }
    foreach ($f in $Files) {
        & $signtool.FullName sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
            /f $pfx /p $password /d DigiClip $f
        if ($LASTEXITCODE -ne 0) { Fail "signtool failed on $f" }
        if (-not $Throwaway) {
            & $signtool.FullName verify /pa $f
            if ($LASTEXITCODE -ne 0) { Fail "signature on $f does not verify" }
        }
    }
} finally {
    Remove-Item $pfx -ErrorAction SilentlyContinue
}
