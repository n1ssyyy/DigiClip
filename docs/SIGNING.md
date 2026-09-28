# Code signing

Releases are built by `.github/workflows/ci.yml` (the `build` job). Signing
is optional: every signing step runs only when its secrets are set, and
without them the installers come out unsigned, exactly as before. Linux
AppImages are not signed.

Secrets go in **Settings → Secrets and variables → Actions** of this
repository. They are passed only to the signing steps, never to `npm` or
`cargo`.

## Windows (Authenticode)

| Secret | What |
|---|---|
| `WINDOWS_CERT_PFX` | The code-signing certificate with its private key, as a `.pfx`, base64-encoded. |
| `WINDOWS_CERT_PASSWORD` | The `.pfx` password. |

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("digiclip-signing.pfx")) | Set-Clipboard
```

What gets signed (SHA-256, timestamped by DigiCert's RFC 3161 server, so
signatures stay valid after the certificate expires):

1. `digiclip-app.exe` and the engine `digiclip.exe`, before they are zipped
   into the app payload.
2. The finished `DigiClip-Setup-Windows-x64.exe`, **after** the payload is
   packed in, so the signature covers the payload as well. Authenticode
   appends its certificate table behind the payload trailer; Setup's
   reader (`setup/src-tauri/src/payload.rs`) finds the trailer in front of
   it. The uninstaller Setup copies into the install folder is cut back to
   the program bytes and is unsigned (it is never downloaded, so
   SmartScreen doesn't look at it).

Every run without the certificate still signs a *copy* of the Setup with a
throwaway self-signed certificate and checks `--payload-info` on it, so a
change that breaks signed Setups fails CI before a real release does.

A standard (OV) certificate works; SmartScreen reputation builds up over
downloads. An EV certificate lives on a hardware token or cloud HSM and
can't be exported as a `.pfx`; it needs the vendor's signing tool in
`sign-windows.ps1` instead.

## macOS (Developer ID + notarization)

| Secret | What |
|---|---|
| `APPLE_CERT_P12` | The **Developer ID Application** certificate with its private key, exported from Keychain Access as `.p12`, base64-encoded (`base64 -i cert.p12 \| pbcopy`). |
| `APPLE_CERT_PASSWORD` | The `.p12` export password. |
| `APPLE_SIGN_ID` | The identity name, e.g. `Developer ID Application: Your Name (TEAMID1234)` (`security find-identity -v -p codesigning`). |
| `APPLE_ID` | The Apple ID email used for notarization. |
| `APPLE_TEAM_ID` | The 10-character team ID. |
| `APPLE_APP_PASSWORD` | An app-specific password for that Apple ID (appleid.apple.com → Sign-In and Security). |

The workflow imports the certificate into a temporary keychain, then for
both `DigiClip.app` (inside the payload) and `DigiClip Setup.app`:

1. signs every Mach-O inside the bundle (the engine lives in
   `Contents/Resources`, where `--deep` doesn't look), then the bundle,
   with the hardened runtime and a secure timestamp
   (`.github/scripts/sign-macos.sh`);
2. submits it to Apple's notary service, waits, and staples the ticket
   (`.github/scripts/notarize-macos.sh`).

`APPLE_CERT_P12` switches the whole macOS path on; the notarization step
also needs the three `APPLE_ID`/`APPLE_TEAM_ID`/`APPLE_APP_PASSWORD`
secrets and is skipped (signed but not notarized) without them.

## After the first signed release

- Check the downloads on a clean machine: Windows should show the
  publisher name instead of "Unknown publisher"; macOS should open the
  Setup without the Privacy & Security detour.
- Then drop the "Not code-signed yet" / "isn't notarized yet" notes from
  the release body at the end of `ci.yml`.
