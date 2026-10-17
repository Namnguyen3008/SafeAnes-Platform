# Kế hoạch chuẩn hóa cấu hình deploy SafeAnes

> **Dành cho agent thực thi:** BẮT BUỘC dùng skill superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để triển khai từng task. Đánh dấu tiến độ bằng checkbox.

**Goal:** Đồng bộ cấu hình local, Render, Vercel, Docker và Lambda; thiết lập đường phát hành có kiểm tra readiness và hướng dẫn rollback.

**Architecture:** Giữ Vercel chạy Next.js, Render chạy FastAPI và ECR/Lambda chạy container hiện có. Đồng bộ cấu hình với đường dẫn trong container, thêm CI không deploy, làm cho image Lambda truy vết được theo release bất biến, và ghi rõ các bước phát hành cùng smoke test thực tế.

**Tech Stack:** Next.js 15, Node.js 22, Python 3.12, FastAPI, Docker, Render Blueprint, AWS Lambda/ECR, GitHub Actions, pytest.

**Spec:** docs/superpowers/specs/2026-10-17-safeanes-deployment-parity.md

## Global Constraints — Ràng buộc chung

- Validate cấu hình lúc startup; đường dẫn hoặc host sai phải báo lỗi rõ ràng.
- Dùng /models làm model root bên trong backend container hiện tại; local dùng thư mục ./models trong repository.
- SAFEANES_ALLOWED_HOSTS phải liệt kê host cụ thể; không chấp nhận *.
- Giữ signal-file cache production ở giá trị Blueprint 24; code default chỉ là giá trị dự phòng cho môi trường phát triển.
- Không để secret trong NEXT_PUBLIC_*, giá trị Blueprint được commit, image layer, log hoặc commit.
- Xác minh trạng thái auto-deploy của Vercel và Render; xem Lambda là release ECR/container thủ công qua aws/scripts/deploy_lambda.py trừ khi xác minh được automation đang hoạt động.
- Người dùng đã ủy quyền rollout production trực tiếp ngày 2026-10-17; không dùng staging làm target. Chỉ cập nhật platform secret hoặc Lambda khi preflight xác nhận đúng production service và token inference đồng bộ; dừng rollout nếu không truy cập được đúng workspace hoặc health gate thất bại.

## Review Focus — Trọng tâm review

- Model root trong container và đường dẫn artifact được copy không khớp: Docker build/readiness tests chứng minh cả hai phân giải về /models; Task 1.
- Wildcard/forwarded host không khớp TrustedHostMiddleware: từ chối wildcard và kiểm tra host Render đã cấu hình; Task 1.
- Signal-file cache lệch giữa Blueprint và code: bảo đảm giá trị production là 24; Task 1.
- CI vô tình deploy hoặc cần production secret: workflow tests xác nhận chỉ build/test; Task 2.
- Lambda release ghi đè hoặc chỉ báo latest: deploy helper tests yêu cầu image reference riêng cho build và digest được báo cáo; Task 3.

---

### Task 1: Đồng bộ cấu hình local và Render với backend runtime

**Files:**
- Sửa: .env.example
- Sửa: backend/.env.example
- Sửa: render.yaml
- Sửa: backend/app/core/config.py
- Sửa: scripts/initialize-local.ps1
- Kiểm thử: backend/tests/test_runtime_configuration.py
- Kiểm thử: backend/tests/test_deployment_config.py
- Chỉ chỉnh local khi thực hiện: .env (không stage/commit)

**Interfaces:**
- Đầu vào: Settings.from_env(), _parse_hosts(raw: str | None) -> tuple[str, ...] và đường dẫn model artifact trong backend/app/ml/registry/model_registry.json hiện có.
- Đầu ra: file example local phân giải model artifact từ ./models; Render khai báo /models, host cụ thể safeanes-backend-kfjc.onrender.com, SAFEANES_SIGNAL_FILE_CACHE_ENTRIES=24 và trường secret SAFEANES_INFERENCE_SERVICE_TOKEN chưa có giá trị được commit.

- [x] **Step 1: Viết kiểm thử config parity trước**

  Thêm test_default_model_root_resolves_to_repository_models và test_settings_reject_wildcard_allowed_hosts vào backend/tests/test_runtime_configuration.py. Thêm test_render_blueprint_matches_backend_container_paths_and_cache_value và test_render_blueprint_uses_explicit_backend_host_and_secret_reference vào backend/tests/test_deployment_config.py.

- [x] **Step 2: Chạy kiểm thử và xác nhận cấu hình hiện tại làm chúng thất bại**

  Chạy: python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_deployment_config.py -q
  Kết quả mong đợi: FAIL vì file example đang trỏ ra ngoài repository, Render dùng /app/models và *, còn khai báo signal-file cache lệch với code default.

- [x] **Step 3: Đồng bộ Settings, file example, Blueprint và local initializer**

  Đặt SAFEANES_MODEL_ROOT=./models trong .env.example và backend/.env.example; bảo đảm đường dẫn UC04/UC05 nằm dưới model root đó. Đặt model root Render thành /models, host rõ ràng thành safeanes-backend-kfjc.onrender.com, cache entries thành 24 và inference token thành sync: false. Giữ code default 64 cho local không cấu hình. Cải thiện thông báo của scripts/initialize-local.ps1 để khi model path sai thì hướng dẫn operator dùng artifact path đã đăng ký. Khi thực thi, chỉ cập nhật các khóa path trong .env bị ignore; giữ các giá trị khác và tuyệt đối không stage file này.

- [x] **Step 4: Chạy kiểm thử config và readiness local**

  Chạy: python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_deployment_config.py -q và ./scripts/initialize-local.ps1 -RequireRuntimeArtifacts
  Kết quả mong đợi: PASS khi local model artifact có sẵn; path đã cấu hình và path /models trong Docker khớp với runtime tương ứng.

- [x] **Step 5: Commit chỉ các file config và test được theo dõi**

      git add .env.example backend/.env.example render.yaml backend/app/core/config.py scripts/initialize-local.ps1 backend/tests/test_runtime_configuration.py backend/tests/test_deployment_config.py
      git commit -m "fix: align SafeAnes runtime deployment config"

### Task 2: Thêm CI cho app, config và container build mà không deploy

**Files:**
- Tạo: .github/workflows/safeanes-ci.yml
- Kiểm thử: backend/tests/test_deployment_config.py

**Interfaces:**
- Đầu vào: Contract config từ Task 1.
- Đầu ra: Workflow chạy khi có pull request/push, cài Node 22 và Python 3.12, build Next.js, chạy backend tests xác định được và build image Docker cho backend cùng Lambda nhưng không push/deploy.

- [x] **Step 1: Định nghĩa kiểm tra workflow và assertion config**

  Thêm test_ci_workflow_runs_builds_and_does_not_deploy vào backend/tests/test_deployment_config.py. Xác nhận workflow có frontend build, Python tests và cả hai Docker build commands; không có docker push, aws lambda update-function-code, Vercel deploy hoặc Render deploy.

- [x] **Step 2: Chạy workflow contract test và xác nhận hiện tại thất bại**

  Chạy: python -m pytest backend/tests/test_deployment_config.py::test_ci_workflow_runs_builds_and_does_not_deploy -q
  Kết quả mong đợi: FAIL vì chưa có .github/workflows/safeanes-ci.yml.

- [x] **Step 3: Tạo .github/workflows/safeanes-ci.yml**

  Chạy workflow khi có pull request và push tới main; dùng checkout, Node 22 với npm ci, Python 3.12 cùng test requirements cho API/ML, npm run build, python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_api_backend.py -q và docker build cho backend/Dockerfile cùng aws/lambda_inference/Dockerfile. Không thêm deploy credential hoặc bước publish.

- [x] **Step 4: Kiểm tra workflow contract và chạy các bước tương đương local**

  Chạy: python -m pytest backend/tests/test_deployment_config.py -q, npm run build và python -m pytest backend/tests/test_runtime_configuration.py backend/tests/test_api_backend.py -q
  Kết quả mong đợi: PASS; có thể chạy Docker build local nếu máy có Docker daemon, CI chạy cả hai image build trên hosted runner.

  Kết quả xác minh bổ sung: Docker Desktop đã được khởi động; cả `docker build -f backend/Dockerfile -t safeanes-backend:ci .` và `docker build -f aws/lambda_inference/Dockerfile -t safeanes-lambda:ci .` đều thành công. Hai image chỉ được tạo local, không push.

- [x] **Step 5: Commit workflow CI và tests**

      git add .github/workflows/safeanes-ci.yml backend/tests/test_deployment_config.py
      git commit -m "ci: verify SafeAnes builds without deployment"

### Task 3: Làm Lambda image release bất biến và truy vết được

**Files:**
- Sửa: aws/scripts/deploy_lambda.py
- Kiểm thử: backend/tests/test_lambda_deploy_script.py

**Interfaces:**
- Đầu vào: deploy() và các ECR repository/function constants hiện có.
- Đầu ra: image_tag_for_build(build_id: str) -> str và image_uri_for_build(build_id: str) -> str; deploy nhận build ID đã validate, push image tag riêng, truy vấn ECR digest, cập nhật Lambda bằng image reference bất biến và in build ID/digest mà không in credential.

- [x] **Step 1: Viết deploy-helper tests trước**

  Thêm test_image_tag_uses_validated_build_id, test_image_reference_is_not_latest_only và test_deploy_output_includes_ecr_digest_without_secret_values vào backend/tests/test_lambda_deploy_script.py. Mock run_cmd; tests không gọi AWS hoặc Docker.

- [x] **Step 2: Chạy helper tests và xác nhận chúng thất bại**

  Chạy: python -m pytest backend/tests/test_lambda_deploy_script.py -q
  Kết quả mong đợi: FAIL vì script hiện chỉ tag/cập nhật :latest và không báo image digest.

- [x] **Step 3: Cập nhật aws/scripts/deploy_lambda.py**

  Lấy build ID mặc định từ SAFEANES_BUILD_ID hoặc commit đang checkout; validate theo quy tắc build ID hiện có; tag/push image riêng, đọc ECR digest rồi gọi update-function-code với repository@sha256:digest. Giữ region/repository/function defaults. Không truyền service token trên command line hoặc in token.

- [x] **Step 4: Chạy helper tests và kiểm tra cú pháp**

  Chạy: python -m pytest backend/tests/test_lambda_deploy_script.py -q và python -m py_compile aws/scripts/deploy_lambda.py
  Kết quả mong đợi: PASS mà không gọi AWS/Docker.

- [x] **Step 5: Commit deploy script và tests**

      git add aws/scripts/deploy_lambda.py backend/tests/test_lambda_deploy_script.py
      git commit -m "fix: deploy Lambda by immutable image digest"

### Task 4: Viết tài liệu release, readiness, smoke test và rollback

**Files:**
- Tạo: docs/operations/SAFEANES_DEPLOYMENT_RUNBOOK.md
- Sửa: aws/scripts/test_lambda_inference.py

**Interfaces:**
- Đầu vào: Tasks 1–3 và contract live inference tại docs/superpowers/specs/2026-10-17-safeanes-inference-contract.md.
- Đầu ra: Runbook ghi cách kiểm tra auto-deploy Vercel/Render, lệnh release Lambda image thủ công, nơi cấu hình secret, health/readiness endpoints, smoke test inference đã xác thực, cách ghi version/digest, mốc rollback và lệnh cấm gọi prediction Lambda từ browser.

- [x] **Step 1: Viết test xử lý token cho smoke script**

  Thêm test_lambda_smoke_script_reads_service_token_from_environment vào backend/tests/test_deployment_config.py. Xác nhận script không chứa token literal và lấy giá trị môi trường để gửi Authorization: Bearer.

- [x] **Step 2: Chạy test và xác nhận hiện tại thất bại**

  Chạy: python -m pytest backend/tests/test_deployment_config.py::test_lambda_smoke_script_reads_service_token_from_environment -q
  Kết quả mong đợi: FAIL vì smoke script hiện gọi Lambda mà không có service token.

- [x] **Step 3: Cập nhật smoke script và thêm release runbook**

  Làm cho aws/scripts/test_lambda_inference.py dừng sớm nếu thiếu biến môi trường service token, chỉ gửi token trong Authorization header và không in token. Trong runbook, ghi health route hiện có /api/v1/health/live, readiness route /api/v1/health/ready, inference production qua FastAPI, Lambda health endpoint, cách xác minh auto-deploy Vercel/Render, release thủ công bằng aws/scripts/deploy_lambda.py, các kiểm tra thành công và rollback về deploy Vercel/Render cùng Lambda digest gần nhất đã ghi nhận.

- [x] **Step 4: Validate runbook và smoke script**

  Chạy: python -m pytest backend/tests/test_deployment_config.py -q, python -m py_compile aws/scripts/test_lambda_inference.py và git diff --check
  Kết quả mong đợi: PASS; các lệnh này không thay đổi service production hoặc secret.

- [x] **Step 5: Commit runbook và smoke-script changes**

      git add docs/operations/SAFEANES_DEPLOYMENT_RUNBOOK.md aws/scripts/test_lambda_inference.py backend/tests/test_deployment_config.py
      git commit -m "docs: document SafeAnes release verification"

### Task 5: Phát hành và xác thực production

**Files:**
- Chỉ đọc: cấu hình và log Render service
- Chỉ đọc: trạng thái deployment Vercel
- Chỉ đọc: Lambda function image digest và readiness
- Tạo sau khi production smoke test hoàn tất: docs/operations/SAFEANES_PRODUCTION_RELEASE_REPORT.md

**Interfaces:**
- Đầu vào: Tasks 1–4, user authorization production ngày 2026-10-17, CI xanh và preflight xác nhận đúng production resources.
- Đầu ra: Báo cáo production release có service build IDs, Lambda image digest, endpoint status, inference source/provenance và tham chiếu rollback.

- [ ] **Step 1: Preflight production và ghi rollback point**

  Chạy lại CI trên đúng `main` SHA. Xác minh Render production service `safeanes-backend` thuộc đúng workspace, theo dõi nhánh `main`, host `/models`, cache 24 và có `SAFEANES_INFERENCE_SERVICE_TOKEN`; chỉ đọc trạng thái có/không, không đọc/ghi secret qua log. Xác minh Vercel production trỏ về đúng Render API và Lambda `safeanes-inference` có cùng token, URL/config đang phục vụ. Ghi lại Render/Vercel deployment IDs và Lambda resolved image digest làm rollback point. Với Supabase, xác nhận bốn bảng VitalDB, quyền/policies, không orphan/invalid row và không đổi `clinical_*`. Nếu không truy cập được đúng Render workspace hoặc chưa thể đồng bộ token, dừng trước khi publish Lambda.

- [ ] **Step 2: Triển khai release production từ main**

  Supabase migration đã áp dụng và xác minh ở version `20261017155542`. Sau khi CI xanh, để Vercel/Render auto-deploy commit `main`; xác minh cả hai deploy trỏ cùng release. Sau khi service token đã khớp ở Render/Lambda, chạy `python aws/scripts/deploy_lambda.py --function-name safeanes-inference` để phát hành ECR image theo digest bất biến. Không tạo staging resource và không dùng `:latest` làm rollback reference.

- [ ] **Step 3: Chạy health, inference và replay smoke trên production**

  Xác nhận Vercel `/safeanes` trả 200; Render liveness/readiness healthy và build ID mới; Lambda `/health` trả 200; request thiếu/sai token hoặc tensor bị từ chối; UC04/UC05 qua FastAPI trả đúng model/version provenance cùng `LIVE_INFERENCE`; offline data vẫn mang `OFFLINE_CACHE`; playback/SSE tiếp tục chạy khi inference chậm, lỗi hoặc generation cũ bị loại. Không chấp nhận sample/fallback prediction.

- [ ] **Step 4: Rollback production khi bất kỳ gate nào lỗi**

  Dừng bước tiếp theo. Khôi phục Vercel/Render về deployment đã ghi; cập nhật Lambda về ECR digest cũ đã ghi và chờ function ổn định. Với migration, giữ dữ liệu/cột additive; nếu cần đảo policy, dùng migration tiến tới đã review, tuyệt đối không phục hồi quyền ghi `anon`/`authenticated` rộng. Chạy lại health/readiness trước khi kết thúc rollback.

- [ ] **Step 5: Ghi nhận production release report**

  Tạo `docs/operations/SAFEANES_PRODUCTION_RELEASE_REPORT.md` từ SHA đã deploy, Vercel/Render deployment IDs/build IDs, Lambda image digest, migration ID, endpoint/smoke results, provenance và rollback reference. Không đưa giá trị secret hoặc dữ liệu bệnh nhân vào báo cáo.

      git add docs/operations/SAFEANES_PRODUCTION_RELEASE_REPORT.md
      git commit -m "docs: record SafeAnes production release"

Trạng thái production ngày 2026-10-17 (cập nhật sau khi xác minh Render):

- GitHub `origin/main` và worktree đều ở `778f2d31ea0708062db4241eae1d3860b8d659fd`; commit đã được push trước đó.
- Vercel production deployment `dpl_2LjnyXNUYabyKYAnpLhWL1QtaPCa` ở trạng thái `READY` cho SHA trên. `/safeanes` và API readiness qua proxy trả 200, nhưng payload backend vẫn báo build ID cũ `f7c50dc542e6f8369377ff48aebc2a3f3c28bd3355074fff452fd8036830b0aa`.
- Render API key hiện xác thực đúng workspace `Nguyễn Văn's workspace` (`tea-db3r7aqj9qps738oico0`). Production service `safeanes-backend` là `srv-db5jpkijnfac73aocevg`, theo dõi nhánh `main` của `Namnguyen3008/SafeAnes-Platform`. Deploy `dep-db9p2pbm8hqs73anfnq0` build thành công nhưng `update_failed`; runtime log xác nhận FastAPI thoát với `ValueError` vì thiếu `SAFEANES_INFERENCE_SERVICE_TOKEN` khi remote inference bật. Token parity hiện đã được cấu hình ở Render và Lambda; service vẫn đang chạy deployment trước đó `dep-db9da9m90tus73btuo5g` từ SHA `dcf76389288d3ce205e78a1df2b7b5950955a029` cho tới deploy tiếp theo.
- AWS `ap-southeast-1`: `safeanes-inference` Active, không alias; image URI mutable `:latest`, digest đang chạy `sha256:6632c0df333393cf0a15274ec1a4cba61ae93889caff3e76f9cc3318fbf2fe6b`; service token đã được cấu hình. `/health` trả 200. Cần phát hành image theo digest bất biến theo release plan sau khi kiểm tra CI và Render/Vercel deployment.
- Supabase project `nntxlqchytvfmutmixea`: migration `safeanes_vitaldb_contract_20261017` (version `20261017155542`) đã áp dụng và xác minh. Counts vẫn là `39/714/104/63`; RLS bật; `anon`/`authenticated` đọc được nhưng không ghi; `service_role` ghi được; không orphan/invalid row. Snapshot năm policy `clinical_*` giữ cùng fingerprint trước/sau.

Các bước 1–5 là production gates và chưa được đánh dấu hoàn tất. Supabase migration và token parity Render/Lambda đã hoàn tất; deploy Render mới chưa được kích hoạt lại. Tiếp tục phát hành `main`, xác minh Vercel trỏ tới build backend mới, rồi chạy inference và replay smoke.
