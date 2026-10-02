#!/usr/bin/env python3
"""Download model files from a GitHub Release into api/models and verify their checksums.

    python scripts/fetch_models.py                    # ONNX files used by the API (default)
    python scripts/fetch_models.py --originals        # best.pt + .h5 (for ml/ conversion & parity)
    python scripts/fetch_models.py --tag models-v1 --repo Rahulreddy2004/Food-tracker-AI

Checksums come from api/models/manifest.json (committed, so a changed release file is caught).
For files without a recorded checksum, the release's SHA256SUMS file (written by the models
workflow) is used instead; with neither, the file is downloaded and its sha256 printed so it can
be added to the manifest. --strict refuses any file it cannot verify (use it for deploys).
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

    group = "originals" if args.originals else "serving"
    files: dict[str, str | None] = manifest["files"][group]
    fallback = release_sums(args.repo, args.tag) if not all(files.values()) else {}
    MODELS.mkdir(parents=True, exist_ok=True)
    failed = False
    for name, recorded in files.items():
        expected = recorded or fallback.get(name)
        if expected and not recorded:
            print(f"  {name}: using the checksum from the release's SHA256SUMS")
        dest = MODELS / name
        if dest.exists() and not args.force and expected and sha256(dest) == expected:
            print(f"✓ {name} (already present)")
            continue
        url = f"https://github.com/{args.repo}/releases/download/{args.tag}/{name}"
        print(f"↓ {url}")
        try:
            download(url, dest)
        except OSError as exc:
            print(f"✗ {name}: {exc}", file=sys.stderr)
            failed = True
            continue
        actual = sha256(dest)
        if expected is None and args.strict:
            print(f"✗ {name}: no checksum to verify against (sha256={actual})", file=sys.stderr)
            dest.unlink()
            failed = True
        elif expected is None:
            print(f"! {name}: no checksum recorded yet. sha256={actual}  (add it to manifest.json)")
        elif actual != expected:
            print(
                f"✗ {name}: checksum mismatch (expected {expected}, got {actual})", file=sys.stderr
            )
            dest.unlink()
            failed = True
        else:
            print(f"✓ {name} verified")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
