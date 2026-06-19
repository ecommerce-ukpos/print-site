"""
populate_sku_specs.py
Reads print_spec_v9.xlsx and upserts all rows into the sku_specs Supabase table.

Usage:
    pip install pandas openpyxl supabase
    SUPABASE_URL=https://fqaxuhbcwoikeldnxuvv.supabase.co \
    SUPABASE_SERVICE_KEY=<your-service-role-key> \
    python populate_sku_specs.py --file print_spec_v9.xlsx
"""

import os
import re
import sys
import argparse
import pandas as pd
from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]


def parse_dim(raw):
    """
    Parse 'W x H' string into (w, h) floats. Returns (None, None) if unparseable.
    Handles: '594 x 841', '1878.8 x 964.4', '600 x 200', etc.
    """
    if not raw or (isinstance(raw, float) and pd.isna(raw)):
        return None, None
    m = re.match(r"^\s*([\d.]+)\s*[xX×]\s*([\d.]+)", str(raw).strip())
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def safe_int(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def safe_str(val):
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    return s if s else None


def row_to_record(row):
    tw, th = parse_dim(row.get("Template / document size (mm)"))
    bw, bh = parse_dim(row.get("Bleed size (mm)"))
    fw, fh = parse_dim(row.get("Finished size (mm)"))
    sw, sh = parse_dim(row.get("Safe area size (mm)"))

    sku_file = safe_str(row.get("SKU / file"))
    if not sku_file:
        return None  # skip rows with no filename

    return {
        "sku_family":             safe_str(row.get("SKU Family")),
        "sku_file":               sku_file,
        "template_code":          safe_str(row.get("Template code stated in PDF")),
        "product_name":           safe_str(row.get("Product name / description")),

        "template_w_mm":          tw,
        "template_h_mm":          th,
        "bleed_w_mm":             bw,
        "bleed_h_mm":             bh,
        "finished_w_mm":          fw,
        "finished_h_mm":          fh,
        "safe_w_mm":              sw,
        "safe_h_mm":              sh,

        "template_size_raw":      safe_str(row.get("Template / document size (mm)")),
        "bleed_size_raw":         safe_str(row.get("Bleed size (mm)")),
        "finished_size_raw":      safe_str(row.get("Finished size (mm)")),
        "safe_size_raw":          safe_str(row.get("Safe area size (mm)")),

        "bleed_allowance":        safe_str(row.get("Bleed allowance")),
        "safe_margin":            safe_str(row.get("Safe margin")),
        "obstruction_areas":      safe_str(row.get("Non-print / obstruction areas")),
        "required_dpi":           safe_int(row.get("Required DPI")),
        "pixel_dimensions":       safe_str(row.get("Pixel dimensions at required DPI")),
        "colour_profile":         safe_str(row.get("Colour profile")),
        "orientation":            safe_str(row.get("Orientation")),
        "file_formats_upload":    safe_str(row.get("File formats accepted for upload")),
        "output_format":          safe_str(row.get("Final output format for print")),
        "substrate":              safe_str(row.get("Substrate / material")),
        "single_or_double_sided": safe_str(row.get("Single or double-sided")),
        "failure_modes":          safe_str(row.get("Common failure modes / artwork risks")),
        "source_pdf":             safe_str(row.get("Source PDF / page / section")),
        "notes":                  safe_str(row.get("Notes / confidence")),

        # Storage path — set once PDFs are uploaded to the templates bucket
        "template_pdf_path":      f"templates/{sku_file}",
        "template_pdf_path_side2": None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to print_spec_v9.xlsx")
    parser.add_argument("--dry-run", action="store_true", help="Print records without inserting")
    args = parser.parse_args()

    df = pd.read_excel(args.file, sheet_name="Extracted Data")
    print(f"Loaded {len(df)} rows from '{args.file}'")

    records = []
    skipped = 0
    for _, row in df.iterrows():
        rec = row_to_record(row)
        if rec is None:
            skipped += 1
            continue
        records.append(rec)

    print(f"  {len(records)} valid records, {skipped} skipped (no filename)")

    # Deduplicate by sku_file — keep last occurrence (most recent/complete row)
    seen = {}
    for r in records:
        seen[r["sku_file"]] = r
    records = list(seen.values())
    print(f"  {len(records)} unique sku_file values after deduplication")

    if args.dry_run:
        for r in records[:5]:
            print(r)
        print(f"  ... (dry run, not inserting)")
        return

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Upsert in batches of 100 (on sku_file — one row per PDF file)
    batch_size = 100
    inserted = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        result = supabase.table("sku_specs").upsert(
            batch,
            on_conflict="sku_file"
        ).execute()
        inserted += len(batch)
        print(f"  Upserted {inserted}/{len(records)}...")

    print(f"Done. {inserted} rows upserted into sku_specs.")


if __name__ == "__main__":
    main()