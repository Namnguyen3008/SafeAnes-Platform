import argparse
import json
import time
import requests

def test_lambda(url: str):
    print(f"Testing Lambda Inference Endpoint: {url}")
    session = requests.Session()
    
    # 1. Health check
    print("\n1. Health Check...")
    t0 = time.time()
    r = session.get(f"{url.rstrip('/')}/health", timeout=30)
    print(f"   Status: {r.status_code}, Elapsed: {(time.time() - t0)*1000:.1f}ms")
    print(f"   Body: {r.text}")
    assert r.status_code == 200

    # 2. UC04 Prediction
    print("\n2. UC04 Inference Test (Case 1 at 600s)...")
    t0 = time.time()
    payload_uc04 = {
        "case_id": "1",
        "model_id": "SafeAnes-UC04-HypoFormer",
        "prediction_time_s": 600.0,
    }
    r = session.post(f"{url.rstrip('/')}/predict/uc04", json=payload_uc04, timeout=45)
    print(f"   Status: {r.status_code}, Elapsed: {(time.time() - t0)*1000:.1f}ms")
    data = r.json()
    preds = data.get("predictions", [])
    print(f"   Predictions count: {len(preds)}")
    if preds:
        print(f"   First prediction horizon: {preds[0].get('horizon_if_supported')}min, score: {preds[0].get('interpreted_output', {}).get('value')}")
    assert r.status_code == 200

    # 3. UC05 Prediction
    print("\n3. UC05 Inference Test (Case 1 at 600s)...")
    t0 = time.time()
    payload_uc05 = {
        "case_id": "1",
        "model_id": "SafeAnes-UC05-RespFormer",
        "prediction_time_s": 600.0,
    }
    r = session.post(f"{url.rstrip('/')}/predict/uc05", json=payload_uc05, timeout=45)
    print(f"   Status: {r.status_code}, Elapsed: {(time.time() - t0)*1000:.1f}ms")
    data = r.json()
    preds = data.get("predictions", [])
    print(f"   Predictions count: {len(preds)}")
    if preds:
        print(f"   First prediction horizon: {preds[0].get('horizon_if_supported')}min, score: {preds[0].get('interpreted_output', {}).get('value')}")
    assert r.status_code == 200

    print("\nALL LAMBDA TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", required=True, help="Lambda Function URL")
    args = parser.parse_args()
    test_lambda(args.url)
