# Installing Tokidachi from the MSIX package

Every release also ships an MSIX package (`Tokidachi_<version>_x64.msix`) as an
alternative to the MSI/NSIS installer. **The MSI/NSIS installer remains the
recommended install path for most users** — grab it from the same release
page unless you specifically want MSIX.

## Why Windows may refuse to install the MSIX

Unless the repository owner has configured a real code-signing certificate
(`WINDOWS_CERT_B64` / `WINDOWS_CERT_PASSWORD` secrets), the MSIX is signed
with a **self-signed certificate** generated at build time. Windows will not
install an MSIX signed by a certificate it doesn't already trust, so you need
to import the accompanying `.cer` file before installing. This is an inherent
limitation of self-signed MSIX packages, not a bug in the build.

If the release was built with a real certificate, no `.cer` file will be
attached and you can install the `.msix` directly by double-clicking it.

## Installing a self-signed MSIX

1. Download both `Tokidachi_<version>_x64.msix` and `Tokidachi_<version>_x64.cer`
   from the release page.
2. Import the certificate into the Local Machine "Trusted People" store
   (requires an elevated/Administrator PowerShell prompt):

   ```powershell
   Import-Certificate -FilePath Tokidachi_<version>_x64.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
   ```

3. Make sure sideloading is enabled: **Settings → Update & Security → For
   developers → Sideload apps** (or install "Developer Mode").
4. Install the package:

   ```powershell
   Add-AppxPackage -Path Tokidachi_<version>_x64.msix
   ```

   If Windows still complains about trust, retry with `-Force` after
   confirming step 2 succeeded (`Get-ChildItem Cert:\LocalMachine\TrustedPeople`
   should list the Tokidachi certificate).

## Uninstalling

MSIX installs register like any other Windows app: **Settings → Apps →
Installed apps → Tokidachi → Uninstall**.
