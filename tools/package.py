"""Build a Chrome-only release from an explicit runtime allowlist."""
from pathlib import Path
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"
RUNTIME_FILES = [
    "manifest.json", "background.js", "content.js", "gmail_filter.js",
    "popup.html", "popup.js", "styles.css", "gov_agencies.js", "banks.js",
    "trusted_domains.js", "firebase_config.js", "report_handler.js",
    "welcome.html", "welcome.js", "_locales/en/messages.json",
    "_locales/zh_TW/messages.json", "icons/icon16.png", "icons/icon48.png",
    "icons/icon128.png",
]

def package():
    manifest = json.loads((EXTENSION / "manifest.json").read_text(encoding="utf-8"))
    for relative in RUNTIME_FILES:
        if not (EXTENSION / relative).is_file():
            raise FileNotFoundError(relative)
    destination = ROOT / "dist" / ("NoMoreScamTW_Extension_v" + manifest["version"] + ".zip")
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for relative in RUNTIME_FILES:
            archive.write(EXTENSION / relative, relative)
    print(destination)
    print(f"Packaged {len(RUNTIME_FILES)} reviewed runtime files.")
    return destination

if __name__ == "__main__":
    package()
