import json
import subprocess
import sys
import time

REGION = "ap-southeast-1"
ACCOUNT_ID = "127091441306"
REPO_NAME = "safeanes-inference"
FUNCTION_NAME = "safeanes-inference"
ROLE_ARN = f"arn:aws:iam::{ACCOUNT_ID}:role/safeanes-keepalive-lambda-role"
IMAGE_URI = f"{ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com/{REPO_NAME}:latest"


def run_cmd(cmd: str, check: bool = True) -> str:
    print(f"\n>> {cmd}")
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"Error (Exit {res.returncode}):\n{res.stderr}")
        raise RuntimeError(f"Command failed: {cmd}\nStderr: {res.stderr}")
    return res.stdout.strip()


def deploy():
    print("=== Step 1: ECR Login ===")
    login_cmd = f"aws ecr get-login-password --region {REGION} | docker login --username AWS --password-stdin {ACCOUNT_ID}.dkr.ecr.{REGION}.amazonaws.com"
    run_cmd(login_cmd)

    print("\n=== Step 2: Build Docker Image ===")
    build_cmd = "docker build -t safeanes-inference:latest -f aws/lambda_inference/Dockerfile ."
    run_cmd(build_cmd)

    print("\n=== Step 3: Tag and Push to ECR ===")
    run_cmd(f"docker tag safeanes-inference:latest {IMAGE_URI}")
    run_cmd(f"docker push {IMAGE_URI}")

    print("\n=== Step 4: Create or Update Lambda Function ===")
    check_fn = run_cmd(f"aws lambda get-function --function-name {FUNCTION_NAME} --region {REGION}", check=False)
    
    if "ResourceNotFoundException" in check_fn or not check_fn:
        print("Creating Lambda function...")
        create_cmd = (
            f"aws lambda create-function "
            f"--function-name {FUNCTION_NAME} "
            f"--package-type Image "
            f"--code ImageUri={IMAGE_URI} "
            f"--role {ROLE_ARN} "
            f"--timeout 60 "
            f"--memory-size 2048 "
            f"--region {REGION}"
        )
        run_cmd(create_cmd)
        print("Waiting for function active...")
        run_cmd(f"aws lambda wait function-active-v2 --function-name {FUNCTION_NAME} --region {REGION}")
    else:
        print("Updating Lambda function code...")
        update_cmd = f"aws lambda update-function-code --function-name {FUNCTION_NAME} --image-uri {IMAGE_URI} --region {REGION}"
        run_cmd(update_cmd)
        print("Waiting for function updated...")
        run_cmd(f"aws lambda wait function-updated-v2 --function-name {FUNCTION_NAME} --region {REGION}")

    print("\n=== Step 5: Configure Function URL ===")
    url_check = run_cmd(f"aws lambda get-function-url-config --function-name {FUNCTION_NAME} --region {REGION}", check=False)
    function_url = None
    if "ResourceNotFoundException" in url_check or not url_check:
        print("Creating Function URL with CORS...")
        cors_config = '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["*"]}'
        create_url_cmd = (
            f"aws lambda create-function-url-config "
            f"--function-name {FUNCTION_NAME} "
            f"--auth-type NONE "
            f"--cors '{cors_config}' "
            f"--region {REGION}"
        )
        res_json = json.loads(run_cmd(create_url_cmd))
        function_url = res_json.get("FunctionUrl")
        
        # Add public invoke permission
        perm_cmd = (
            f"aws lambda add-permission "
            f"--function-name {FUNCTION_NAME} "
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

    print(f"\nSUCCESS! Lambda Function URL: {function_url}")
    return function_url


if __name__ == "__main__":
    deploy()
