#!/usr/bin/env python3
"""Thin wrapper so the migration can be run from the repo root.

cd api && uv run python ../scripts/migrate_v1_to_v2.py --timezone Asia/Kolkata [--apply]
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from app.tools.migrate_v1 import main

if __name__ == "__main__":
    main()
