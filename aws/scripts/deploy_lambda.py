from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from backend.app.core.build_info import validate_build_id

REGION = "ap-southeast-1"
ACCOUNT_ID = "127091441306"
REPO_NAME = "safeanes-inference"
FUNCTION_NAME = "safeanes-inference"
ROLE_ARN = f"arn:aws:iam::{ACCOUNT_ID}:role/safeanes-keepalive-lambda-role"
ECR_REGISTRY_URI = f"{ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com"
IMAGE_REPOSITORY_URI = f"{ECR_REGISTRY_URI}/{REPO_NAME}"


def run_cmd(cmd: str, check: bool = True) -> str:
    print(f"\n>> {cmd}")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"Error (Exit {res.returncode}):\n{res.stderr}")
        raise RuntimeError(f"Command failed: {cmd}\nStderr: {res.stderr}")
    return res.stdout.strip()


def image_tag_for_build(build_id: str) -> str:
    validated_id = validate_build_id(build_id)
    sanitized_id = re.sub(r"[^A-Za-z0-9_.-]", "-", validated_id).strip(".-") or "release"
    digest_suffix = hashlib.sha256(validated_id.encode("utf-8")).hexdigest()[:12]
    return f"build-{sanitized_id[:108]}-{digest_suffix}"


def image_uri_for_build(build_id: str) -> str:
    return f"{IMAGE_REPOSITORY_URI}:{image_tag_for_build(build_id)}"


def _resolve_build_id(build_id: str | None = None) -> str:
    if build_id is not None:
        return validate_build_id(build_id)

    configured_id = os.environ.get("SAFEANES_BUILD_ID")
    if configured_id:
        return validate_build_id(configured_id)

    commit_id = run_cmd("git rev-parse --short=12 HEAD")
    return validate_build_id(commit_id)


def _image_digest_for_tag(image_tag: str) -> str:
    output = run_cmd(
        f"aws ecr describe-images --repository-name {REPO_NAME} "
        f"--image-ids imageTag={image_tag} --region {REGION}"
    )
    response = json.loads(output)
    image_details = response.get("imageDetails")
    digest = image_details[0].get("imageDigest") if isinstance(image_details, list) and image_details else None
    if not isinstance(digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise RuntimeError("ECR did not return a valid SHA-256 image digest")
    return digest


def _validate_function_name(function_name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", function_name):
        raise ValueError("SAFEANES_LAMBDA_FUNCTION_NAME must contain 1-64 letters, digits, hyphens, or underscores")
    return function_name


def deploy(build_id: str | None = None, function_name: str = FUNCTION_NAME) -> str | None:
    validated_id = _resolve_build_id(build_id)
    validated_function_name = _validate_function_name(function_name)
    tag = image_tag_for_build(validated_id)
    tagged_image_uri = image_uri_for_build(validated_id)
    immutable_image_uri: str | None = None

    print("=== Step 1: ECR Login ===")
    login_cmd = (
        f"aws ecr get-login-password --region {REGION} | docker login "
        f"--username AWS --password-stdin {ECR_REGISTRY_URI}"
    )
    run_cmd(login_cmd)

    print("\n=== Step 2: Build Docker Image ===")
    local_image_uri = f"safeanes-inference:{tag}"
    build_cmd = f"docker build -t {local_image_uri} -f aws/lambda_inference/Dockerfile ."
    run_cmd(build_cmd)

    print("\n=== Step 3: Tag, Push, and Resolve Immutable Image ===")
    run_cmd(f"docker tag {local_image_uri} {tagged_image_uri}")
    run_cmd(f"docker push {tagged_image_uri}")
    digest = _image_digest_for_tag(tag)
    immutable_image_uri = f"{IMAGE_REPOSITORY_URI}@{digest}"
    print(f"Release build ID: {validated_id}")
    print(f"ECR image digest: {digest}")
    print(f"Immutable image reference: {immutable_image_uri}")

    print("\n=== Step 4: Create or Update Lambda Function ===")
    check_fn = run_cmd(
        f"aws lambda get-function --function-name {validated_function_name} --region {REGION}",
        check=False,
    )

    if "ResourceNotFoundException" in check_fn or not check_fn:
        print("Creating Lambda function...")
        create_cmd = (
            f"aws lambda create-function "
            f"--function-name {validated_function_name} "
            f"--package-type Image "
            f"--code ImageUri={immutable_image_uri} "
            f"--role {ROLE_ARN} "
            f"--timeout 60 "
            f"--memory-size 2048 "
            f"--region {REGION}"
        )
        run_cmd(create_cmd)
        print("Waiting for function active...")
        run_cmd(f"aws lambda wait function-active-v2 --function-name {validated_function_name} --region {REGION}")
    else:
        print("Updating Lambda function code...")
        update_cmd = (
            f"aws lambda update-function-code --function-name {validated_function_name} "
            f"--image-uri {immutable_image_uri} --region {REGION}"
        )
        run_cmd(update_cmd)
        print("Waiting for function updated...")
        run_cmd(f"aws lambda wait function-updated-v2 --function-name {validated_function_name} --region {REGION}")

    print("\n=== Step 5: Configure Function URL ===")
    url_check = run_cmd(
        f"aws lambda get-function-url-config --function-name {validated_function_name} --region {REGION}",
        check=False,
    )
    function_url = None
    if "ResourceNotFoundException" in url_check or not url_check:
        print("Creating Function URL with CORS...")
        cors_config = '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"]}'
        create_url_cmd = (
            f"aws lambda create-function-url-config "
            f"--function-name {validated_function_name} "
            f"--auth-type NONE "
            f"--cors '{cors_config}' "
            f"--region {REGION}"
        )
        res_json = json.loads(run_cmd(create_url_cmd))
        function_url = res_json.get("FunctionUrl")

        perm_cmd = (
            f"aws lambda add-permission "
            f"--function-name {validated_function_name} "
            f"--statement-id FunctionURLAllowPublicAccess "
            f"--action lambda:InvokeFunctionUrl "
            f"--principal '*' "
            f"--function-url-auth-type NONE "
            f"--region {REGION}"
        )
        run_cmd(perm_cmd, check=False)
    else:
        res_json = json.loads(url_check)
        function_url = res_json.get("FunctionUrl")

    print(f"\nRelease ready: build_id={validated_id} image_digest={digest}")
    print(f"Lambda Function URL: {function_url}")
    return function_url


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Build and release the SafeAnes Lambda inference image.")
    parser.add_argument(
        "--function-name",
        default=FUNCTION_NAME,
        help=f"AWS Lambda function to update (defaults to {FUNCTION_NAME})",
    )
    args = parser.parse_args(argv)
    deploy(function_name=args.function_name)


if __name__ == "__main__":
    main()
