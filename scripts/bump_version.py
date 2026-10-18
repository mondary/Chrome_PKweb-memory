#!/usr/bin/env python3
"""Bump the unpacked Chrome extension version and prepend a changelog entry."""

import json
import re
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "extension" / "manifest.json"
CHANGELOG_PATH = ROOT / "CHANGELOG.md"
VERSION_PATTERN = re.compile(r"^(\d{4})\.(\d{1,2})\.(\d+)$")


def main() -> None:
    today = date.today()
    year, month = today.year, today.month

    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    current_label = manifest.get("version_name", manifest.get("version", ""))
    match = VERSION_PATTERN.fullmatch(current_label)
    patch = int(match.group(3)) + 1 if match and (int(match.group(1)), int(match.group(2))) == (year, month) else 1

    version_name = f"{year}.{month:02d}.{patch}"
    manifest_version = f"{year}.{month}.{patch}"
    manifest["version"] = manifest_version
    manifest["version_name"] = version_name
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    changelog = CHANGELOG_PATH.read_text(encoding="utf-8")
    entry = (
        f"\n## [{version_name}] - {today.isoformat()}\n\n"
        "### Added\n\n"
    )
    heading = "# Changelog"
    if not changelog.startswith(heading):
        raise ValueError("Le titre '# Changelog' est introuvable en tête de CHANGELOG.md")
    CHANGELOG_PATH.write_text(heading + entry + changelog[len(heading):].lstrip("\n"), encoding="utf-8")
    print(f"Version {version_name} écrite dans le manifest et le changelog.")


if __name__ == "__main__":
    main()
