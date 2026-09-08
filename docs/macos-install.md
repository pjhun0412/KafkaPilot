# macOS Internal Install

KafkaPilot macOS builds can be distributed internally without Apple signing or notarization.

## Build

Run on a macOS machine:

```bash
npm ci
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
```

Artifacts are written to:

```text
out/
```

Recommended local toolchain:

- Node.js 22 LTS
- npm from the installed Node.js distribution
- A clean dependency install with `npm ci`

## Install

Copy the generated macOS artifact to the target Mac and move `KafkaPilot.app` to `Applications`.

If macOS blocks the first launch, use:

1. Right-click `KafkaPilot.app`
2. Click `Open`
3. Confirm `Open`

If it is still blocked, remove the quarantine flag:

```bash
xattr -dr com.apple.quarantine /Applications/KafkaPilot.app
```

## Updates

Unsigned macOS builds can check and download update metadata, but fully automatic replacement can be unreliable because of Gatekeeper and quarantine behavior.

For internal use, manual update installation is recommended unless Apple signing and notarization are configured.

If update checks are enabled for macOS releases, upload `latest-mac.yml` together with the macOS artifact in GitHub Releases.
