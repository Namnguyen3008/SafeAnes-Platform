import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import json
from backend.app.vitaldb.pipeline import (
    CaseInspector,
    ImmutableVitalDBStore,
    _make_manifest,
    _catalog_entry,
    _download_raw_case,
    _sha256_file
)
from backend.app.ml.preprocessing.vitaldb_loader import VitalDBWindowLoader
import vitaldb
from vitaldb import dataset as vitaldb_dataset

def integrate_case(cid: int):
    print(f"=== Integrating Case {cid} (Clinical Hypoxemia / Lung Lobectomy) ===")
    data_root = PROJECT_ROOT / "backend" / "data" / "vitaldb"
    store = ImmutableVitalDBStore(data_root, vitaldb_module=vitaldb)
    dataset_version = str(vitaldb_dataset.DATASET_VERSION)
    
    # 1. Download / verify raw .vital
    print("Step 1: Downloading raw .vital file...")
    raw_path, raw_sha, dl_time, dl_size, dl_basis = _download_raw_case(store, cid, dataset_version)
    print(f"Raw saved: {raw_path} ({dl_size} bytes, sha256: {raw_sha})")
    
    # 2. Inspect case
    print("Step 2: Inspecting with CaseInspector...")
    loader = VitalDBWindowLoader(vitaldb_module=vitaldb)
    inspector = CaseInspector(loader)
    inspected = inspector.inspect(cid, ["UC04", "UC05"], source_path=raw_path)
    
    # 3. Create manifest
    print("Step 3: Creating manifest...")
    manifest = _make_manifest(
        inspected,
        raw_path=raw_path,
        raw_sha256=raw_sha,
        raw_size_bytes=dl_size,
        download_time=dl_time,
        download_time_basis=dl_basis,
        source_uri=f"https://api.vitaldb.net/{dataset_version}/{cid}.vital",
        dataset_version=dataset_version,
        vitaldb_module=vitaldb,
        loader=loader
    )
    
    # Save manifest
    manifest_path = data_root / "manifests" / f"{cid}.json"
    processed_path = data_root / "processed" / f"{cid}.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    processed_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Manifest written: {manifest_path}")
    
    # 4. Update catalog
    catalog_path = PROJECT_ROOT / "backend" / "data" / "manifests" / "vitaldb_case_catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8")) if catalog_path.exists() else {"cases": []}
    
    # Remove existing if any
    catalog["cases"] = [c for c in catalog["cases"] if str(c.get("case_id")) != str(cid)]
    entry = _catalog_entry(manifest)
    catalog["cases"].append(entry)
    catalog["cases"].sort(key=lambda x: int(x["case_id"]))
    catalog_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Catalog updated: {catalog_path} (Total cases: {len(catalog['cases'])})")
    
    print("\nCase summary:")
    print("UC04 valid windows:", manifest["number_of_valid_windows"]["uc04"])
    print("UC05 valid windows:", manifest["number_of_valid_windows"]["uc05"])
    print("UC05 SpO2 runs >= 60s:", manifest["quality_summary"]["uc05"]["trajectory_summary"]["spo2_task_threshold_runs_60s"])
    print("Patient context:", manifest["patient_context"])
    print("SUCCESS!")

if __name__ == "__main__":
    integrate_case(49)
