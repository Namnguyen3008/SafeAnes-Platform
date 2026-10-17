import subprocess
import sys

def login(token: str):
    cmd = "docker login --username AWS --password-stdin 127091441306.dkr.ecr.ap-southeast-1.amazonaws.com"
    res = subprocess.run(cmd, input=token, text=True, capture_output=True, shell=True)
    print("Return code:", res.returncode)
    print("Stdout:", res.stdout)
    print("Stderr:", res.stderr)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        token = sys.argv[1].strip()
        login(token)
    else:
        print("Please provide token")
