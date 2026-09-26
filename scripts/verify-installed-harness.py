#!/usr/bin/env python3
"""Verify an extracted/installed SWF package against its content manifest, read-only."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat


def verify(root):
    root = Path(root)
    errors = []
    actual = set()
    # Walk without following symlinks, including links to directories.
    def walk(directory):
        for item in directory.iterdir():
            mode = item.lstat().st_mode
            relative = item.relative_to(root).as_posix()
            if stat.S_ISDIR(mode):
                walk(item)
            elif stat.S_ISREG(mode):
                actual.add(relative)
            else:
                errors.append(f"Non-regular entry: {relative}")

    if root.is_symlink() or not root.is_dir():
        raise ValueError("Package root must be a real directory")
    walk(root)
    manifest_name = "CONTENT-MANIFEST.json"
    if manifest_name not in actual:
        raise ValueError("Missing regular CONTENT-MANIFEST.json")
    manifest = json.loads((root / manifest_name).read_text())
    if manifest.get("algorithm") != "sha256":
        raise ValueError("Expected sha256 manifest")
    if manifest.get("excludes") != [manifest_name, "LICENSES.json"]:
        raise ValueError("Unexpected manifest exclusions")
    entries = manifest.get("files")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Manifest must contain files")
    expected = set()
    verified = 0
    for entry in entries:
        name = entry.get("path")
        if (not isinstance(name, str) or not name or "\\" in name
                or PurePosixPath(name).is_absolute()
                or any(part in ("", ".", "..") for part in name.split("/"))):
            errors.append(f"Invalid manifest path: {name!r}")
            continue
        if name in expected or name in manifest["excludes"]:
            errors.append(f"Duplicate or excluded manifest path: {name}")
            continue
        expected.add(name)
        if name not in actual:
            errors.append(f"Missing regular file: {name}")
            continue
        data = (root / name).read_bytes()
        if len(data) != entry.get("bytes") or hashlib.sha256(data).hexdigest() != entry.get("sha256"):
            errors.append(f"Content mismatch: {name}")
        else:
            verified += 1
    for name in sorted(actual - expected - set(manifest["excludes"])):
        errors.append(f"Unlisted file: {name}")
    if "LICENSES.json" not in actual:
        errors.append("Missing regular LICENSES.json")
    return {"ok": not errors, "verifiedFiles": verified, "errors": errors,
            "scope": "Content integrity only; manifest is not a signature. No Host discovery, model, runtime, license or clean-environment acceptance."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plugin_root", help="Extracted package or installed cache directory")
    args = parser.parse_args()
    try:
        result = verify(args.plugin_root)
    except (OSError, ValueError, TypeError, AttributeError) as error:
        result = {"ok": False, "errors": [str(error)]}
    print(json.dumps(result, indent=2))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
