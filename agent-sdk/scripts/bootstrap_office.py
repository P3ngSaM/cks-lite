# -*- coding: utf-8 -*-
"""
CKS Lite - Office Document Dependencies Bootstrap
Installs all Python packages needed for document manipulation.
Run once: python scripts/bootstrap_office.py
"""

import subprocess
import sys

PACKAGES = [
    # Excel
    "openpyxl",         # Read/write .xlsx
    "pandas",           # Data analysis, also reads Excel
    "matplotlib",       # Chart generation

    # PowerPoint
    "python-pptx",      # Read/write .pptx

    # Word
    "python-docx",      # Read/write .docx

    # PDF
    "PyMuPDF",          # Read PDF (import fitz)

    # Images
    "Pillow",           # Image processing

    # Utilities
    "chardet",          # Encoding detection for CSV/text files
]


def check_installed(package: str) -> bool:
    """Check if a package is importable."""
    import_name = {
        "python-pptx": "pptx",
        "python-docx": "docx",
        "PyMuPDF": "fitz",
        "Pillow": "PIL",
    }.get(package, package)

    try:
        __import__(import_name)
        return True
    except ImportError:
        return False


def main():
    missing = [p for p in PACKAGES if not check_installed(p)]

    if not missing:
        print("All office document packages are already installed.")
        return

    print(f"Installing {len(missing)} missing packages: {', '.join(missing)}")

    for pkg in missing:
        print(f"  Installing {pkg}...")
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", pkg, "-q"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"    {pkg} installed successfully")
        else:
            print(f"    FAILED to install {pkg}: {result.stderr.strip()}")

    print("\nDone. Verification:")
    for pkg in PACKAGES:
        status = "OK" if check_installed(pkg) else "MISSING"
        print(f"  [{status}] {pkg}")


if __name__ == "__main__":
    main()
