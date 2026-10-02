#!/usr/bin/env python3
"""Download model files from a GitHub Release into api/models and verify their checksums.

    python scripts/fetch_models.py                    # files the API serves (default)
    python scripts/fetch_models.py --originals        # best.pt + .h5 (for ml/ conversion & parity)
    python scripts/fetch_models.py --tag models-v1 --repo Rahulreddy2004/Food-tracker-AI

Checksums come from api/models/manifest.json (committed, so a changed release file is caught).
For files without a recorded checksum, the release's SHA256SUMS file (written by the models
workflow) is used instead; with neither, the file is downloaded and its sha256 printed so it can
be added to the manifest. --strict refuses any file it cannot verify (use it for deploys).
Files listed as optional (your detector, your EfficientNet) are skipped if the release lacks them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODELS = ROOT / "api" / "models"
MANIFEST = MODELS / "manifest.json"
UA = "food-tracker-fetch-models"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=60) as response, tmp.open("wb") as out:
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        while chunk := response.read(1 << 20):
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {dest.name}: {done / total:6.1%} of {total / 1e6:.1f} MB", end="")
    print()
    tmp.replace(dest)


def release_sums(repo: str, tag: str) -> dict[str, str]:
    """name -> sha256 from the release's SHA256SUMS ("<hex>  <name>" lines), or {} if absent."""
    url = f"https://github.com/{repo}/releases/download/{tag}/SHA256SUMS"
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            text = response.read().decode()
    except OSError:
        return {}
    sums: dict[str, str] = {}
    for line in text.splitlines():
        parts = line.split()
        if len(parts) == 2:
            sums[parts[1].lstrip("*")] = parts[0].lower()
    return sums


def fetch(name: str, expected: str | None, args: argparse.Namespace, *, required: bool) -> bool:
    """Download and verify one file. Returns False when that should fail the run."""
    dest = MODELS / name
    if dest.exists() and not args.force and expected and sha256(dest) == expected:
        print(f"✓ {name} (already present)")
        return True
    url = f"https://github.com/{args.repo}/releases/download/{args.tag}/{name}"
    print(f"↓ {url}")
    try:
        download(url, dest)
    except OSError as exc:
        if not required:
            print(f"– {name}: not on the release (optional): {exc}")
            return True
        print(f"✗ {name}: {exc}", file=sys.stderr)
        return False
    actual = sha256(dest)
    if expected is None and args.strict:
        print(f"✗ {name}: no checksum to verify against (sha256={actual})", file=sys.stderr)
        dest.unlink()
        return False
    if expected is None:
        print(f"! {name}: no checksum recorded yet. sha256={actual}  (add it to manifest.json)")
    elif actual != expected:
        print(f"✗ {name}: checksum mismatch (expected {expected}, got {actual})", file=sys.stderr)
        dest.unlink()
        return False
    else:
        print(f"✓ {name} verified")
    return True


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("--repo", default=manifest["repo"])
    parser.add_argument("--tag", default=manifest["tag"])
    parser.add_argument(
        "--originals", action="store_true", help="fetch best.pt and the .h5 instead"
    )
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    parser.add_argument("--strict", action="store_true", help="fail on files with no checksum")
    args = parser.parse_args()

    groups = manifest["files"]
    # (name, recorded checksum, required)
    wanted: list[tuple[str, str | None, bool]] = (
        [(n, h, True) for n, h in groups["originals"].items()]
        if args.originals
        else [(n, h, True) for n, h in groups["serving"].items()]
        + [(n, h, False) for n, h in groups.get("optional", {}).items()]
    )
    fallback = release_sums(args.repo, args.tag) if not all(h for _, h, _ in wanted) else {}
    MODELS.mkdir(parents=True, exist_ok=True)
    ok = True
    for name, recorded, required in wanted:
        expected = recorded or fallback.get(name)
        if expected and not recorded:
            print(f"  {name}: using the checksum from the release's SHA256SUMS")
        ok &= fetch(name, expected, args, required=required)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
