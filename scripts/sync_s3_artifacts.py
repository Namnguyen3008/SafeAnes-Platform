#!/usr/bin/env python3
"""
SafeAnes S3 Artifact Sync Utility
Synchronizes model checkpoints (UC04 HypoFormer, UC05 RespFormer) and VitalDB datasets
between AWS S3 and local container/disk storage.
"""

from __future__ import annotations

import argparse
import logging
import os
from pathlib import Path
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("safeanes.s3_sync")


def get_s3_client():
    try:
        import boto3
        from botocore.exceptions import NoCredentialsError
    except ImportError:
        logger.warning("boto3 is not installed. Install boto3 to enable AWS S3 sync: pip install boto3")
        return None

    region = os.getenv("AWS_REGION", "ap-southeast-1")
    try:
        client = boto3.client("s3", region_name=region)
        return client
    except Exception as exc:
        logger.warning(f"Could not initialize S3 client: {exc}")
        return None


def sync_download(client, bucket_name: str, s3_prefix: str, local_dir: Path) -> bool:
    if not client or not bucket_name:
        logger.info("S3 client or bucket name not configured; skipping remote download.")
        return False

    local_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Downloading from s3://{bucket_name}/{s3_prefix} to {local_dir}...")

    try:
        paginator = client.get_paginator("list_objects_v2")
        count = 0
        for page in paginator.paginate(Bucket=bucket_name, Prefix=s3_prefix):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                relative_key = os.path.relpath(key, s3_prefix) if s3_prefix else key
                target_file = local_dir / relative_key
                target_file.parent.mkdir(parents=True, exist_ok=True)

                if not target_file.exists() or target_file.stat().st_size != obj["Size"]:
                    logger.info(f"Downloading {key} -> {target_file}")
                    client.download_file(bucket_name, key, str(target_file))
                    count += 1
        logger.info(f"S3 download complete. Synced {count} files.")
        return True
    except Exception as exc:
        logger.warning(f"Failed to sync from S3 bucket {bucket_name}: {exc}")
        return False


def sync_upload(client, bucket_name: str, local_dir: Path, s3_prefix: str) -> bool:
    if not client or not bucket_name:
        logger.error("AWS S3 credentials or bucket name not available.")
        return False

    if not local_dir.exists():
        logger.error(f"Local directory does not exist: {local_dir}")
        return False

    logger.info(f"Uploading from {local_dir} to s3://{bucket_name}/{s3_prefix}...")
    try:
        count = 0
        for file_path in local_dir.rglob("*"):
            if file_path.is_file():
                rel_path = file_path.relative_to(local_dir).as_posix()
                s3_key = f"{s3_prefix.rstrip('/')}/{rel_path}" if s3_prefix else rel_path
                logger.info(f"Uploading {file_path} -> s3://{bucket_name}/{s3_key}")
                client.upload_file(str(file_path), bucket_name, s3_key)
                count += 1
        logger.info(f"Upload complete. Uploaded {count} files to s3://{bucket_name}.")
        return True
    except Exception as exc:
        logger.error(f"Upload to S3 failed: {exc}")
        return False


def main():
    parser = argparse.ArgumentParser(description="SafeAnes AWS S3 Artifact Sync")
    parser.add_argument("--action", choices=["download", "upload"], default="download")
    parser.add_argument("--target", choices=["models", "datasets", "all"], default="models")
    parser.add_argument("--models-dir", default=os.getenv("SAFEANES_MODEL_ROOT", "./models"))
    parser.add_argument("--data-dir", default=os.getenv("SAFEANES_DATA_ROOT", "./backend/data"))
    args = parser.parse_args()

    client = get_s3_client()
    models_bucket = os.getenv("AWS_S3_BUCKET_MODELS", "safeanes-models")
    datasets_bucket = os.getenv("AWS_S3_BUCKET_DATASETS", "safeanes-datasets")

    if args.action == "download":
        if args.target in ("models", "all"):
            sync_download(client, models_bucket, "", Path(args.models_dir))
        if args.target in ("datasets", "all"):
            sync_download(client, datasets_bucket, "", Path(args.data_dir))
    elif args.action == "upload":
        if args.target in ("models", "all"):
            sync_upload(client, models_bucket, Path(args.models_dir), "")
        if args.target in ("datasets", "all"):
            sync_upload(client, datasets_bucket, Path(args.data_dir), "")


if __name__ == "__main__":
    main()
