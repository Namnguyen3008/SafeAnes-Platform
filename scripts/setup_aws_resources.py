#!/usr/bin/env python3
"""
SafeAnes AWS Resource Provisioning Script
Creates S3 buckets for model weights and datasets, and outputs least-privilege IAM policies.
"""

import json
import logging
import os
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("safeanes.aws_setup")


def create_buckets():
    try:
        import boto3
        from botocore.exceptions import ClientError
    except ImportError:
        logger.error("boto3 is not installed. Run: pip install boto3")
        sys.exit(1)

    region = os.getenv("AWS_REGION", "ap-southeast-1")
    models_bucket = os.getenv("AWS_S3_BUCKET_MODELS", "safeanes-models")
    datasets_bucket = os.getenv("AWS_S3_BUCKET_DATASETS", "safeanes-datasets")

    s3 = boto3.client("s3", region_name=region)

    for bucket in (models_bucket, datasets_bucket):
        try:
            logger.info(f"Creating S3 bucket: {bucket} in region {region}...")
            if region == "us-east-1":
                s3.create_bucket(Bucket=bucket)
            else:
                s3.create_bucket(
                    Bucket=bucket,
                    CreateBucketConfiguration={"LocationConstraint": region},
                )
            logger.info(f"Bucket {bucket} successfully created.")
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("BucketAlreadyOwnedByYou", "BucketAlreadyExists"):
                logger.info(f"Bucket {bucket} already exists.")
            else:
                logger.error(f"Failed to create bucket {bucket}: {e}")

    policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "SafeAnesS3Access",
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:ListBucket"
                ],
                "Resource": [
                    f"arn:aws:s3:::{models_bucket}",
                    f"arn:aws:s3:::{models_bucket}/*",
                    f"arn:aws:s3:::{datasets_bucket}",
                    f"arn:aws:s3:::{datasets_bucket}/*"
                ]
            }
        ]
    }
    logger.info("Recommended AWS IAM Policy for SafeAnes Backend:")
    print(json.dumps(policy, indent=2))


if __name__ == "__main__":
    create_buckets()
