#!/usr/bin/env python3
"""Check the packaged CLI without a separate installation or live repository actions."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def probe(bundle, environment, case):
    result = subprocess.run(
        [str(bundle / "Contents/MacOS/grove-app"), "--check-bundled-cli"],
        env=environment, capture_output=True, text=True, timeout=45,
    )
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{case}: no diagnostic JSON; stderr: {result.stderr.strip()}") from error
    print(json.dumps({"case": case, "exit": result.returncode, "result": payload}, separators=(",", ":")), flush=True)
    return result.returncode, payload


def check(bundle):
    source = Path(__file__).resolve().parents[1]
    app_version = json.loads((source / "src-tauri/tauri.conf.json").read_text())["version"]
    cli_version = json.loads((source / "src-tauri/sidecar.lock.json").read_text())["version"]
    require((bundle / "Contents/MacOS/grove").is_file(), "The supplied app has no bundled CLI")

    with tempfile.TemporaryDirectory(prefix="grove-packaged-cli-") as temporary:
        # Tauri rejects executable paths through /var's symlink on macOS.
        root = Path(temporary).resolve()
        repositories = root / "repositories"
        repositories.mkdir()
        environment = {**os.environ, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin",
                       "HERD_ROOT": str(repositories), "GROVE_CONFIG": "/dev/null"}

        code, payload = probe(bundle, environment, "minimal-path")
        require(code == 0 and payload == {
            "success": True, "app_version": app_version,
            "cli_version": f"grove version {cli_version}",
            "repository_count": 0, "source": "bundled-sidecar",
        }, "The packaged CLI failed its isolated startup check")

        fixture = root / "Grove.app"
        subprocess.run(["/usr/bin/ditto", str(bundle), str(fixture)], check=True)
        (fixture / "Contents/MacOS/grove").unlink()
        fake_bin = root / "fake-bin"
        fake_bin.mkdir()
        marker = root / "path-cli-used"
        fake_cli = fake_bin / "grove"
        fake_cli.write_text('#!/bin/sh\n/usr/bin/touch "$GROVE_TEST_PATH_MARKER"\necho "grove version 99.0.0"\n')
        fake_cli.chmod(0o755)
        environment.update(PATH=f"{fake_bin}:{environment['PATH']}", GROVE_TEST_PATH_MARKER=str(marker))

        code, payload = probe(fixture, environment, "missing-bundled-cli")
        require(not marker.exists(), "The app incorrectly used a separate CLI from PATH")
        require(code != 0 and payload.get("success") is False
                and payload.get("error", {}).get("code") == "BUNDLED_CLI_MISSING",
                "A missing bundled CLI must report BUNDLED_CLI_MISSING and exit non-zero")
    print("PASS: bundled CLI works without a separate installation; missing resources fail closed")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("app", type=Path, help="Path to the packaged Grove.app")
    arguments = parser.parse_args()
    try:
        check(arguments.app.resolve())
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Packaged CLI check failed: {error}\n")
