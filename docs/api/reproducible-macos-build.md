# Reproducible macOS build inputs

The `Tests` workflow builds a native macOS app on pushes and pull requests targeting
`main`, `master` or `develop`. It runs the frontend tests and build, the pinned CLI's
trust/configuration/report contract tests, Rust tests and Clippy, then uploads an
unsigned `grove-macos-unsigned` app archive. A successful run proves the build path;
opening the app, signing, notarisation and publishing remain separate release checks.

## Required inputs and access

- Node comes from `.nvmrc` (22); `package-lock.json` pins npm package versions and
  integrity. Rust dependencies come from `src-tauri/Cargo.lock` with `--locked`.
- `src-tauri/sidecar.lock.json` records the CLI repository, a full committed Git
  revision and the SHA-256 of the generated `grove` script. CI checks out that
  revision, runs its `build.sh`, and `scripts/prepare-sidecar.sh` rejects any digest
  mismatch. A mutable sibling checkout alone is insufficient.
- The private `@stuntrocket/ui` package is currently locked to a local registry URL.
  Supply its exact authorised tarball; the build does not replace the source URL,
  invent a public registry or commit the private archive. `scripts/cache-ui.mjs`
  verifies the archive against the lockfile's SHA-512 before adding it to npm's
  content cache. `npm ci --prefer-offline` then uses those verified bytes.
- Repository secret `STUNTROCKET_UI_TARBALL_URL` must contain an authorised HTTPS
  download URL for that exact archive. A signed URL can carry its own access grant;
  treat it as a secret and renew it when it expires. The workflow does not print
  the URL or upload the tarball as an artefact.
- If the CLI repository is private, set `GROVE_CLI_READ_TOKEN` to a token with
  read-only contents access to `withoutfanfare/grove-cli`. Otherwise the workflow
  falls back to `github.token`, which normally cannot read another private repo.
  Neither token is persisted in the CLI checkout.

Missing secrets, inaccessible downloads, unavailable CLI revisions and digest
mismatches stop the workflow. Fork pull requests normally do not receive repository
secrets; run the trusted branch in a context with authorised access. Do not use
`pull_request_target` to give untrusted changes those secrets.

The macOS runner, Node 22 patch version and stable Rust toolchain can change. This
lane repeats the recorded source and dependency inputs; it does not promise
byte-for-byte identical app bundles across toolchain or SDK updates.

## Build from a clean checkout

Prerequisites are macOS, Xcode Command Line Tools, Node 22, npm, stable Rust,
Python 3, zsh and Bats (`bats-core`). Start in a fresh clone of this app so that the
checks exercise installation rather than an existing `node_modules` directory.
Obtain the private UI tarball through your authorised package source and set
`STUNTROCKET_UI_TARBALL` to its local file path. No registry server is required.

```sh
node scripts/cache-ui.mjs --help
node scripts/cache-ui.mjs "$STUNTROCKET_UI_TARBALL"
npm ci --prefer-offline
npm test
npm run build
```

Clone the CLI into a separate empty directory using your authorised Git access.
The following reads its revision from the app lock rather than selecting a branch:

```sh
APP_CHECKOUT="$PWD"
CLI_REVISION="$(python3 -c 'import json; print(json.load(open("src-tauri/sidecar.lock.json"))["revision"])')"
CLI_REPOSITORY="$(python3 -c 'import json; print(json.load(open("src-tauri/sidecar.lock.json"))["repository"])')"
git clone "$CLI_REPOSITORY" ../grove-cli-build-input
git -C ../grove-cli-build-input checkout --detach "$CLI_REVISION"
../grove-cli-build-input/build.sh
export GROVE_CLI_SOURCE="$APP_CHECKOUT/../grove-cli-build-input/grove"
npm run prepare-sidecar
```

The preparation command reports the verified SHA-256 and copies the script into
the target-specific sidecar location. Keep `GROVE_CLI_SOURCE` exported for the
rest of this shell session. Then run the same native checks and unsigned build:

```sh
(
  cd ../grove-cli-build-input
  for test_file in tests/integration/trust*.bats; do
    ./run-tests.sh "$test_file"
  done
  ./run-tests.sh config-resolution.bats
  ./run-tests.sh report-base.bats
)
(
  cd src-tauri
  cargo test --locked
  cargo clippy --locked --all-targets
)
npm run tauri -- build --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
```

The app is written to `src-tauri/target/release/bundle/macos/Grove.app`.
The updater artefact override avoids requiring a release signing key for this
build check. It does not alter the committed updater configuration. Clippy runs
without promoting existing warnings to errors; this lane does not claim the
repository's existing Rust formatting or warning baseline is clean.

## Change a pinned input

For a CLI update, review and test the intended CLI commit, run its `build.sh`,
record that full commit and the generated script's SHA-256 in
`src-tauri/sidecar.lock.json`, and rerun preparation and the native checks. Do not
pin a dirty working tree as a revision. For a UI update, obtain authorised access,
update the npm lock normally, and provide the exact new archive through the
secret and local cache helper. A checksum failure calls for checking the inputs,
not bypassing verification.
