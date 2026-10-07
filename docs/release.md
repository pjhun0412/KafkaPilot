# Release Guide

KafkaPilot releases are published from `main`.

## Branches

- `main`: latest deployable state
- `feature/*`: short-lived feature branches
- `fix/*`: short-lived bug fix branches
- `chore/*`: docs, release, and build maintenance

Delete short-lived branches after they are merged into `main`.

## Version

Update the package version before a release:

```bash
npm version x.y.z --no-git-tag-version
```

Run regression tests and verify the build (including Renderer, Main, and Preload type checking):

```bash
npm test
npm run build
```

Commit the version update:

```bash
git add package.json package-lock.json
git commit -m "chore: release x.y.z"
```

## Tag

Create a release tag from `main`:

```bash
git tag vx.y.z
git push origin main vx.y.z
```

## Windows

Prepare the installer locally without publishing:

```powershell
npm run package:win -- --publish never
```

This runs the full build and writes the installer, blockmap, and update metadata to `out/`. Check that `latest.yml` matches the installer's version, size, and SHA-512 before uploading. Check the installer signature separately; successful packaging does not imply code signing or an installation test.

Start release packaging with a clean generated `dist/` directory. The current Vite configuration retains old output, so repeated builds can include unused bundles. Only remove verified, Git-ignored build output within the checkout.

Current release notes: [2.0.8](releases/2.0.8.md).

Publish the Windows installer:

For this checkout, store `GH_TOKEN` in the KafkaPilot **prod** environment in byulsol as `string` / `env` / `server_only`. The user enters it in the web UI and enables agent access to that environment. A fine-grained GitHub token must have Contents read/write permission for `pjhun0412/KafkaPilot`. Verify `byulsol_project_status` and `byulsol_execution_plan` before running. Never copy the token into chat, files, command arguments, or logs.

```powershell
$byulsolCli = 'C:\workspace\byulsol-secret-web\bin\byulsol-labs.exe'
& $byulsolCli provision link --alias home --project b3e4df3d-ed1d-4606-85cc-46f7b9c62d49 --env prod
& $byulsolCli run --env prod --allow-prod --only GH_TOKEN -- npm run release:win
```

Push the intended release commit and tag before publishing. For a staged release, upload the already verified artifacts to a GitHub draft, verify their hashes, then publish it with the matching [release notes](releases/2.0.8.md). Do not replace assets on an existing published version. The CLI injects `GH_TOKEN` only into the child process; the application itself does not need it.

The release should include:

```text
KafkaPilot-Setup-{version}.exe
KafkaPilot-Setup-{version}.exe.blockmap
latest.yml
```

`latest.yml` must point to the Windows installer uploaded for the same version.

## macOS

Build or publish macOS artifacts from a macOS machine.

Unsigned internal package:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:mac
```

Publish to GitHub Releases:

```bash
GH_TOKEN="your_github_token" CSC_IDENTITY_AUTO_DISCOVERY=false npm run release:mac
```

The release should include `latest-mac.yml` if macOS update checks are expected to work.

## Release Notes

Before publishing, update:

- `README.md`
- `README.ko.md`
- `CHANGELOG.md`
- In-app release notes text

Keep release notes focused on user-visible additions, improvements, and fixes.

## Central development metadata

The byulsol project key is `kafkapilot`, project ID `b3e4df3d-ed1d-4606-85cc-46f7b9c62d49`. The Windows checkout uses alias `home` via `.byulsol/project.json`, whose default environment remains `dev`. The authorized 2.0.8 release uses an explicit `--env prod --allow-prod` after checking the prod connection. Repository URL, development UI address and npm commands are registered centrally. The Vite default is `http://localhost:5173`; this records configuration, not a running service.

The local build and regression tests require no external secrets. Secret-dependent execution must check the project's execution plan and inject only the required variables through the CLI. Publishing requires an explicit release request; the user authorized publishing 2.0.8 on 2026-10-07.

## 2.0.8 validation (2026-10-07)

- `npm test`: 21 passed, 0 failed.
- Full Renderer/Main/Preload type checks, Vite build, and Windows x64 NSIS packaging passed.
- After cleaning generated output, the packaged app contains one current main bundle with the E6 option and 2.0.8 release notes. No `.byulsol`, tests, or Git metadata are packaged.
- Installer: `KafkaPilot-Setup-2.0.8.exe`, 147,936,088 bytes, SHA-256 `f797c8e2541f7f668c08b96504bb28b4ad6d15d1281794acec8395ca7b3dbf06`.
- `latest.yml` version, filename, size and SHA-512 match the installer. The blockmap is present.
- The installer is unsigned. Actual installation/upgrade, live Kafka UI operation, and macOS packaging were not tested.
- Independent review found no further defects in the Key/E6 changes and release procedure.
- Existing reverse Export duplication, settings backup/recovery, and failed-subscription cleanup issues remain outside this release's fixes. See the [source analysis](codebase-analysis-2026-09-25.md) for reproduction evidence and scope.

The GitHub release is prepared as a draft, its uploaded asset digests are checked against local files, and only then is it published. Generated artifacts and the local release helper remain ignored under `out/`.
