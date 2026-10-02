#!/usr/bin/env python3
"""Download model files from a GitHub Release into api/models and verify their checksums.

    python scripts/fetch_models.py                    # ONNX files used by the API (default)
    python scripts/fetch_models.py --originals        # best.pt + .h5 (for ml/ conversion & parity)
    python scripts/fetch_models.py --tag models-v1 --repo Rahulreddy2004/Food-tracker-AI

Checksums live in api/models/manifest.json. A file whose checksum is not recorded yet is
downloaded and its sha256 is printed so it can be added to the manifest.
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


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def download(url: str, dest: Path) -> None:
    tmp = dest.with_suffix(dest.suffix + ".part")
    request = urllib.request.Request(url, headers={"User-Agent": "food-tracker-fetch-models"})
    with urllib.request.urlopen(request, timeout=60) as response, tmp.open("wb") as out:  # noqa: S310
        total = int(response.headers.get("Content-Length") or 0)
        done = 0
        while chunk := response.read(1 << 20):
            out.write(chunk)
            done += len(chunk)
            if total:
                print(f"\r  {dest.name}: {done / total:6.1%} of {total / 1e6:.1f} MB", end="")
    print()
    tmp.replace(dest)


def main() -> int:
    manifest = json.loads(MANIFEST.read_text())
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    parser.add_argument("--repo", default=manifest["repo"])
    parser.add_argument("--tag", default=manifest["tag"])
    parser.add_argument("--originals", action="store_true", help="fetch best.pt and the .h5 instead")
    parser.add_argument("--force", action="store_true", help="re-download even if present")
    args = parser.parse_args()

    group = "originals" if args.originals else "serving"
    files: dict[str, str | None] = manifest["files"][group]
    MODELS.mkdir(parents=True, exist_ok=True)
    failed = False
    for name, expected in files.items():
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
        if expected is None:
            print(f"! {name}: no checksum recorded yet. sha256={actual}  (add it to manifest.json)")
        elif actual != expected:
            print(f"✗ {name}: checksum mismatch (expected {expected}, got {actual})", file=sys.stderr)
            dest.unlink()
            failed = True
        else:
            print(f"✓ {name} verified")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
