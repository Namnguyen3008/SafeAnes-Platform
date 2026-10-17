# Kế hoạch triển khai contract inference UC04/UC05 của SafeAnes

> **Dành cho agent thực thi:** BẮT BUỘC dùng skill superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để triển khai từng task. Đánh dấu tiến độ bằng checkbox.

**Goal:** Mọi dự đoán UC04/UC05 trực tiếp phải chạy đúng model trên dữ liệu ca bệnh đã được kiểm tra và chuẩn bị; lỗi phải được thể hiện rõ, contract giữa backend và Lambda phải được bảo vệ.

**Architecture:** FastAPI chịu trách nhiệm chọn ca, kiểm tra readiness, preprocessing, xác thực input và chuẩn hóa kết quả. Một Lambda client nhỏ ở backend gửi tensor có version cùng bearer service token; Lambda xác thực request và chỉ chạy model. Vercel chuyển tiếp yêu cầu dự đoán tới FastAPI; offline cache là một nguồn riêng.

**Tech Stack:** Python 3.12, FastAPI, Pydantic 2, NumPy/PyTorch, AWS Lambda container, Next.js 15, TypeScript 5.9, pytest, Node node:test.

**Spec:** docs/superpowers/specs/2026-10-17-safeanes-inference-contract.md

## Global Constraints — Ràng buộc chung

- FastAPI chịu trách nhiệm chọn ca, tải dữ liệu, preprocessing, xác thực, gọi model và tạo response đã chuẩn hóa.
- Lambda chạy model trên input đầy đủ; không đọc Supabase/VitalDB và không chọn dữ liệu từ cache.
- Input thiếu/sai, model chưa sẵn sàng, timeout hoặc output sai không được biến thành điểm cố định, sample horizon hay kết quả cũ.
- Backend gọi Lambda bằng bearer token chỉ có ở server; token không xuất hiện trong frontend, URL, log hoặc response.
- Kết quả model trực tiếp dùng LIVE_INFERENCE; cache dùng OFFLINE_CACHE và không che lỗi inference trực tiếp.
- UC04/UC05 giữ nguyên schema tensor và hợp đồng horizon riêng của từng model.

## Review Focus — Trọng tâm review

- Lambda thiếu hoặc nhận bearer token sai: trả lỗi xác thực trước khi load model; kiểm thử ở Task 1.
- Tensor thiếu, sai định dạng, không hữu hạn hoặc sai shape: từ chối và không trả predictions; kiểm thử ở Tasks 1 và 3.
- Thiếu service token ở backend khi bật remote inference: readiness bị chặn và không gửi request không xác thực; kiểm thử ở Task 2.
- Lambda timeout, response không phải 2xx hoặc JSON không hợp lệ: trả API error có kiểu, không fallback sang local/cache/điểm cố định; kiểm thử ở Tasks 2 và 3.
- Cache và live predictions đi qua cùng API: giữ rõ OFFLINE_CACHE và LIVE_INFERENCE; kiểm thử ở Task 4.

---

### Task 1: Bắt buộc xác thực và yêu cầu input inference đầy đủ tại Lambda

**Files:**
- Sửa: aws/lambda_inference/app.py
- Sửa: aws/scripts/test_lambda_inference.py
- Kiểm thử: backend/tests/test_lambda_inference_contract.py

**Interfaces:**
- Đầu vào: lambda_handler(event: dict[str, Any], context: Any), handle_uc04_prediction(service, body) và handle_uc05_prediction(service, body) hiện có.
- Đầu ra: endpoint dự đoán yêu cầu Authorization: Bearer <SAFEANES_INFERENCE_SERVICE_TOKEN> và contract_version="safeanes.inference.v1"; chỉ request có tensors phù hợp model mới được gọi predict_window.

- [x] **Step 1: Viết kiểm thử contract Lambda trước**

  Thêm test_prediction_requires_valid_service_token, test_health_endpoint_remains_available_without_service_token, test_uc04_rejects_missing_prepared_tensors, test_uc05_rejects_missing_prepared_tensors và test_prediction_rejects_unknown_contract_version. Xác nhận request không xác thực không gọi get_services; request chỉ có case_id/prediction_time_s không bao giờ trả predictions.

- [x] **Step 2: Chạy kiểm thử và xác nhận fallback hiện tại làm chúng thất bại**

  Chạy: python -m pytest backend/tests/test_lambda_inference_contract.py -q
  Kết quả mong đợi: FAIL vì prediction hiện chưa kiểm tra bearer token và input thiếu có thể tạo predictions mặc định.

- [x] **Step 3: Thêm xác thực request và kiểm tra input nghiêm ngặt trong aws/lambda_inference/app.py**

  Thêm _authorize_request(event: dict[str, Any]) -> bool bằng hmac.compare_digest; chỉ đọc SAFEANES_INFERENCE_SERVICE_TOKEN; trả 503 nếu Lambda chưa cấu hình token và 401 nếu thiếu/sai bearer token. Giữ nguyên /health và CORS preflight. Bắt buộc đúng contract version và tensors theo model trước khi gọi handle_uc04_prediction hoặc handle_uc05_prediction. Xóa cả hai nhánh dự đoán mặc định; input thiếu/sai trả lỗi 4xx an toàn, có kiểu.

- [x] **Step 4: Cập nhật smoke script Lambda theo contract có xác thực**

  Cập nhật test_lambda(url: str, token: str) trong aws/scripts/test_lambda_inference.py để đọc token từ SAFEANES_INFERENCE_SERVICE_TOKEN, chỉ gửi token trong Authorization header, kiểm tra health và xác nhận request có token nhưng thiếu tensors bị từ chối. Smoke test chạy model thật phải đi qua FastAPI vì FastAPI chịu trách nhiệm preprocessing.

- [x] **Step 5: Chạy lại kiểm thử contract Lambda**

  Chạy: python -m pytest backend/tests/test_lambda_inference_contract.py -q
  Kết quả mong đợi: PASS; nhánh input thiếu không trả prediction và secret không xuất hiện trong log đã capture hay response body.

- [x] **Step 6: Commit**

      git add aws/lambda_inference/app.py aws/scripts/test_lambda_inference.py backend/tests/test_lambda_inference_contract.py
      git commit -m "fix: require validated input for Lambda inference"

### Task 2: Thêm Lambda client có version và xác thực ở backend

**Files:**
- Sửa: backend/app/core/config.py
- Tạo: backend/app/services/inference/lambda_client.py
- Kiểm thử: backend/tests/test_runtime_configuration.py
- Kiểm thử: backend/tests/test_remote_inference_contract.py

**Interfaces:**
- Đầu vào: Contract request Lambda từ Task 1.
- Đầu ra: LambdaInferenceClient(function_url: str, service_token: str, timeout_seconds: float = 10.0) có predict(payload: dict[str, Any]) -> dict[str, Any]; settings cung cấp inference_service_token: str | None từ SAFEANES_INFERENCE_SERVICE_TOKEN và loại token khỏi repr.

- [x] **Step 1: Viết kiểm thử settings và transport trước**

  Thêm test_settings_load_inference_service_token_without_exposing_it và test_remote_inference_requires_service_token_when_offload_is_enabled vào backend/tests/test_runtime_configuration.py. Thêm test_lambda_client_sends_versioned_payload_and_bearer_token, test_lambda_client_maps_timeout_to_inference_error và test_lambda_client_rejects_non_2xx_and_invalid_json vào backend/tests/test_remote_inference_contract.py. Dùng opener/transport giả; không gọi AWS.

- [x] **Step 2: Chạy kiểm thử mục tiêu và xác nhận chúng thất bại**

  Chạy: python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_remote_inference_contract.py -q
  Kết quả mong đợi: FAIL vì chưa có setting service token và transport client.

- [x] **Step 3: Thêm setting và LambdaInferenceClient**

  Đọc SAFEANES_INFERENCE_SERVICE_TOKEN trong Settings.from_env(). Khi offload_inference và inference_url được cấu hình, readiness/config validation phải báo lỗi nếu thiếu token. Viết client bằng urllib.request của standard library, timeout cố định, xử lý request/response chỉ bằng JSON, gửi Authorization: Bearer ... và ánh xạ lỗi sang ApiServiceError có kiểu. Không đưa token vào nội dung exception hoặc log.

- [x] **Step 4: Chạy lại kiểm thử transport và settings**

  Chạy: python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_remote_inference_contract.py -q
  Kết quả mong đợi: PASS, bao gồm kiểm tra redaction và timeout mặc định 10 giây.

- [x] **Step 5: Commit**

      git add backend/app/core/config.py backend/app/services/inference/lambda_client.py backend/tests/test_runtime_configuration.py backend/tests/test_remote_inference_contract.py
      git commit -m "feat: add authenticated Lambda inference client"

### Task 3: Chuẩn bị và xác thực tensor trước khi gọi remote inference

**Files:**
- Sửa: backend/app/services/inference/model_manager.py
- Chỉ sửa nếu kiểu prepared-input hiện tại cần hook serialize nhỏ: backend/app/ml/preprocessing/vitaldb_pipeline.py
- Kiểm thử: backend/tests/test_model_manager_remote.py
- Kiểm thử: backend/tests/test_vitaldb_model_preprocessing.py

**Interfaces:**
- Đầu vào: LambdaInferenceClient.predict(payload: dict[str, Any]) -> dict[str, Any] từ Task 2 và TrainingPreprocessorAdapter.prepare(model_id, window, case_signals=series) hiện có.
- Đầu ra: ModelManager.predict(case_id: str, model_id: str, prediction_time_s: float) -> list[dict[str, Any]] xác thực và chuẩn bị cùng một InferenceWindow cho cả local lẫn remote; payload remote có contract_version, model_id chuẩn hóa, case/time, metadata của window, tensor JSON-safe theo model và quality metadata.

- [x] **Step 1: Viết kiểm thử remote path trước**

  Thêm test_remote_predict_sends_prepared_uc04_tensors, test_remote_predict_sends_prepared_uc05_tensors, test_remote_predict_abstains_on_ineligible_input_without_calling_lambda và test_remote_error_does_not_fall_back_to_local_or_cache vào backend/tests/test_model_manager_remote.py. Xác nhận fake client nhận danh sách số hữu hạn với chiều dữ liệu đúng model và contract version đã duyệt.

- [x] **Step 2: Chạy kiểm thử và xác nhận remote bypass hiện tại làm chúng thất bại**

  Chạy: python -m pytest backend/tests/test_model_manager_remote.py -q
  Kết quả mong đợi: FAIL vì ModelManager.predict hiện gửi chỉ case/model/time trước khi đọc và preprocessing cửa sổ VitalDB.

- [x] **Step 3: Chuyển remote call xuống sau readiness và preprocessing dùng chung trong ModelManager.predict**

  Giữ các kiểm tra thời lượng ca, thời điểm hữu hạn, lịch sử bắt buộc, model readiness và TrainingPreprocessorAdapter. Serialize prepared input UC04/UC05 đã qua validation thành mảng JSON-safe rồi gọi LambdaInferenceClient được inject. Ánh xạ lỗi có kiểu vào input_not_eligible, model_not_ready và inference_failed hiện có. Khi bật offload, không fallback sang local inference hoặc offline cache nếu remote lỗi.

- [x] **Step 4: Chạy kiểm thử remote path và preprocessing hồi quy**

  Chạy: python -m pytest backend/tests/test_model_manager_remote.py backend/tests/test_vitaldb_model_preprocessing.py -q
  Kết quả mong đợi: PASS; window không hợp lệ không gọi Lambda, window hợp lệ gửi tensor đã chuẩn bị cho UC04/UC05.

- [x] **Step 5: Commit**

      git add backend/app/services/inference/model_manager.py backend/app/ml/preprocessing/vitaldb_pipeline.py backend/tests/test_model_manager_remote.py backend/tests/test_vitaldb_model_preprocessing.py
      git commit -m "fix: prepare model input before remote inference"

### Task 4: Thống nhất nhãn nguồn API và bỏ đường gọi Lambda trực tiếp từ Vercel

**Files:**
- Sửa: backend/app/schemas/api.py
- Sửa: backend/app/api/routes/cases.py
- Sửa: src/app/api/backend/[...path]/route.ts
- Sửa: src/lib/api/safeanesClient.ts
- Sửa: tests/safeanes-client.test.cjs
- Kiểm thử: backend/tests/test_api_backend.py

**Interfaces:**
- Đầu vào: Danh sách predictions đã validate từ Task 3.
- Đầu ra: PredictionsResponse.source: Literal["LIVE_INFERENCE", "OFFLINE_CACHE"]; mọi request từ browser đi qua Next backend proxy tới FastAPI, còn kết quả replay lấy từ cache giữ nhãn OFFLINE_CACHE.

- [x] **Step 1: Thêm kiểm thử source và routing đang thất bại**

  Thêm test_uc04_and_uc05_prediction_sources_separate_live_and_cache vào backend/tests/test_api_backend.py. Trong tests/safeanes-client.test.cjs thêm next_backend_proxy_does_not_call_lambda_directly để xác nhận backend route không có nhánh tắt SAFEANES_LAMBDA_INFERENCE_URL và PredictionsResponse chỉ chấp nhận hai giá trị source đã nêu.

- [x] **Step 2: Chạy kiểm thử mục tiêu và xác nhận chúng thất bại**

  Chạy: python -m pytest backend/tests/test_api_backend.py -q và node --test tests/safeanes-client.test.cjs
  Kết quả mong đợi: FAIL khi live response còn dùng ON_DEMAND hoặc Vercel route gọi Lambda trực tiếp.

- [x] **Step 3: Cập nhật response model, prediction routes, frontend types và proxy**

  Đặt response UC04/UC05 trực tiếp là LIVE_INFERENCE; giữ response replay từ cache là OFFLINE_CACHE. Đồng bộ TypeScript union. Xóa handleLambdaInference và nơi gọi nó khỏi src/app/api/backend/[...path]/route.ts; giữ proxy forwarding và hành vi Supabase fallback không liên quan.

- [x] **Step 4: Chạy API và frontend contract tests**

  Chạy: python -m pytest backend/tests/test_api_backend.py -q và node --test tests/safeanes-client.test.cjs
  Kết quả mong đợi: PASS; live inference và cache replay phân biệt được, Vercel chỉ chuyển prediction tới FastAPI.

  Kết quả xác minh: API 48 passed, 1 test UC05 bị loại trừ ban đầu do config SHA-256 mismatch; frontend contract 8 passed; build thành công. Mismatch line ending được sửa ở bước xác minh cuối, không thay model hash.

- [x] **Step 5: Commit**

      git add backend/app/schemas/api.py backend/app/api/routes/cases.py src/app/api/backend/[...path]/route.ts src/lib/api/safeanesClient.ts tests/safeanes-client.test.cjs backend/tests/test_api_backend.py
      git commit -m "fix: route live inference through FastAPI"

### Task 5: Xác minh toàn bộ contract từ backend tới Lambda

**Files:**
- Kiểm thử: backend/tests/test_lambda_inference_contract.py
- Kiểm thử: backend/tests/test_remote_inference_contract.py
- Kiểm thử: backend/tests/test_model_manager_remote.py
- Kiểm thử: backend/tests/test_api_backend.py
- Chỉ sửa nếu cần: aws/scripts/test_lambda_inference.py

**Interfaces:**
- Đầu vào: Tasks 1–4.
- Đầu ra: Bộ kiểm thử lặp lại được, chứng minh luồng client → FastAPI → Lambda → FastAPI cùng source/provenance mà không phụ thuộc production.

- [x] **Step 1: Chạy contract suite tập trung**

  Chạy: python -m pytest backend/tests/test_lambda_inference_contract.py backend/tests/test_remote_inference_contract.py backend/tests/test_model_manager_remote.py backend/tests/test_api_backend.py -q
  Kết quả mong đợi: PASS; không còn fallback điểm cố định và không có remote call thiếu xác thực.

  Kết quả xác minh cuối: nguyên nhân checksum là checkout Windows đổi model JSON sang CRLF; `.gitattributes` giữ LF cho JSON model và hash cả năm artifact khớp registry. Contract/regression suite 125 passed, 1 deselected; toàn bộ backend sau khi thêm kiểm tra integrity cho ingest đạt 218 passed, 12 skipped, 13 warnings.

- [x] **Step 2: Chạy bộ kiểm thử backend hồi quy ổn định**

  Chạy: python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_api_backend.py backend/tests/test_uc04_inference.py backend/tests/test_uc05_inference.py -q
  Kết quả mong đợi: PASS cho nhóm kiểm thử cấu hình, API và model contract có tính xác định. Không thêm test_live_inference_replay.py vào lệnh này vì file đó có kiểm tra model/Supabase phụ thuộc môi trường.

  Kết quả xác minh cuối: python -m pytest backend/tests -q đạt 218 passed, 12 skipped, 13 warnings; line ending LF giữ nguyên checksum của năm model artifact.

- [x] **Step 3: Build frontend**

  Chạy: npm run build
  Kết quả mong đợi: PASS với source union và API proxy đã cập nhật.

  Kết quả xác minh cuối: npm run build pass, gồm compile, type check, static generation và postbuild.

- [ ] **Step 4: Smoke test inference trên staging**

  Chạy Lambda smoke script đã cập nhật để xác nhận request thiếu tensors bị từ chối; sau đó gọi UC04/UC05 qua endpoint FastAPI trên Render với cấu hình staging hợp lệ. Xác nhận response có model/version provenance và LIVE_INFERENCE. Không gọi prediction endpoint Lambda từ browser.
  Trạng thái: chưa chạy vì chưa xác minh được Render staging service và Lambda staging target; không gửi inference tới production.
