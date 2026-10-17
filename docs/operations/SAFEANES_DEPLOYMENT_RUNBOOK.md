# SafeAnes production deployment runbook

Luồng production: **browser → Vercel frontend/API proxy → FastAPI trên Render → Lambda inference**. Browser không gọi trực tiếp Lambda Function URL. Dự án không dùng staging; rollout đi thẳng production theo các gate bên dưới.

## Thứ tự phát hành

1. Chạy CI trên đúng SHA dự định phát hành. CI phải build frontend, chạy các backend contract tests và build Docker cho FastAPI cùng Lambda; workflow CI không push image hay deploy.
2. Trước khi thay đổi production, ghi SHA, Vercel/Render deployment IDs/build IDs, Lambda Code.ResolvedImageUri và migration hiện có để làm rollback point. Xác nhận Render service/workspace chính xác, theo dõi main, model root /models, host allowlist cụ thể, signal cache 24; kiểm tra trạng thái có/không của secret mà không đọc giá trị.
3. Áp dụng migration Supabase đã được review bằng migration API sau khi preflight schema/data/policies đạt. Xác nhận migration history, RLS/grants và chính sách clinical_* trước khi tiếp tục. Không ingest VitalDB trong bước deploy schema.
4. Merge/push release lên GitHub main. Để Vercel và Render auto-deploy theo cấu hình của service; xác nhận chúng chạy cùng SHA mới. Thay đổi environment variable trên Render không tự tạo deploy; nếu không có commit mới, trigger manual deploy sau khi xác minh cấu hình.
5. Chỉ sau khi SAFEANES_INFERENCE_SERVICE_TOKEN đã được cấu hình cùng giá trị trong secret store của Render và Lambda, phát hành Lambda bằng ECR digest bất biến. Dừng nếu không kiểm chứng được production target hoặc token parity.
6. Chạy health/readiness, auth-contract, UC04/UC05 live inference và replay SSE smoke. Chỉ công bố release khi tất cả gate đều đạt và có báo cáo không chứa secret/PHI.

## Biến môi trường và credential

Các giá trị phải nằm trong secret/environment store phía server, không commit, không đưa vào NEXT_PUBLIC_*, Docker build args, URL, logs hay báo cáo.

| Thành phần | Tên biến | Mục đích |
| --- | --- | --- |
| Render operator/API | RENDER_API_KEY | Xác thực Render API; chỉ dùng để quản trị tài nguyên, không dùng làm token inference của ứng dụng. Đọc từ process environment, không in ra terminal. |
| Vercel | SAFEANES_API_URL | Base URL của FastAPI trên Render. |
| Vercel | SAFEANES_BACKEND_API_TOKEN | Server-side auth từ Vercel proxy tới FastAPI. |
| Render | SAFEANES_INFERENCE_SERVICE_TOKEN | Bearer token FastAPI gửi tới Lambda. |
| Lambda | SAFEANES_INFERENCE_SERVICE_TOKEN | Expected bearer token cho endpoint prediction; phải khớp với Render. |
| Server-side ingest runner | SUPABASE_SERVICE_ROLE_KEY | Chỉ dùng khi vận hành ingest riêng; không cấp cho browser/client. |

Smoke script đọc SAFEANES_INFERENCE_SERVICE_TOKEN từ process environment và chỉ gửi trong Authorization: Bearer. Script dừng trước request khi thiếu token; không truyền token qua CLI argument.

## Phát hành Lambda

Helper aws/scripts/deploy_lambda.py build image, push tag theo build ID, lấy digest SHA-256 và cập nhật function bằng reference bất biến repository@sha256:.... Cần Docker daemon, AWS CLI credentials có quyền ECR/Lambda và đúng AWS account/region. Luôn chỉ rõ production function:

    $env:SAFEANES_BUILD_ID = (git rev-parse --short=12 HEAD).Trim()
    python aws/scripts/deploy_lambda.py --function-name safeanes-inference

Trước khi phát hành, lưu image reference/digest hiện hành để rollback:

    aws lambda get-function --function-name safeanes-inference --region ap-southeast-1 --query 'Code.ResolvedImageUri' --output text

Không deploy Lambda nếu Render chưa có cùng service token. Không dùng tag latest để xác định release hoặc rollback.

## Health và production smoke

    Invoke-WebRequest -Uri "https://<vercel-production-host>/safeanes" -UseBasicParsing
    Invoke-RestMethod -Uri "https://<render-production-host>/api/v1/health/live"
    Invoke-RestMethod -Uri "https://<render-production-host>/api/v1/health/ready"

Frontend và liveness phải trả HTTP 200. Readiness phải xác nhận service/model sẵn sàng cho UC04/UC05; process HTTP sống không đồng nghĩa model đã nạp được. Backend response phải chứa build ID của SHA vừa deploy. Kiểm tra Lambda /health trả 200; request thiếu/sai token phải bị từ chối trước khi gọi model.

Với case kiểm thử được phép, gọi UC04/UC05 qua UI/API FastAPI và xác nhận response có model/version provenance cùng source LIVE_INFERENCE. Cached view giữ source OFFLINE_CACHE; lỗi inference không được che bằng prediction cache, sample hoặc điểm cố định. Khi replay, pause/seek/chuyển case/resume/reconnect để xác nhận chỉ trạng thái PLAYING schedule inference, generation cũ bị loại và waveform/SSE vẫn tiến triển khi inference chậm/lỗi. Không gửi dữ liệu bệnh nhân thật ngoài phạm vi đã được cho phép.

Lambda smoke script chỉ xác nhận health/auth và việc request thiếu prepared tensors bị từ chối; đó không phải positive model inference. Positive inference phải đi qua FastAPI.

## Rollback

Dừng rollout ở bất cứ gate nào không đạt. Ghi lại failed SHA, build/deploy ID và gate lỗi trước khi rollback.

- Vercel: promote deployment production gần nhất đã được xác minh.
- Render: rollback service về deployment production đã lưu hoặc redeploy đúng SHA đã review.
- Lambda: cập nhật function về immutable ECR digest đã lưu, rồi chờ ổn định:

    aws lambda update-function-code --function-name safeanes-inference --image-uri "127091441306.dkr.ecr.ap-southeast-1.amazonaws.com/safeanes-inference@sha256:<previous-digest>" --region ap-southeast-1
    aws lambda wait function-updated-v2 --function-name safeanes-inference --region ap-southeast-1

- Supabase: không xóa dữ liệu hoặc cột additive. Nếu policy cần đảo, tạo migration tiến tới đã review; không khôi phục quyền ghi anon/authenticated rộng. Giữ nguyên bảng/policies clinical_*.

Sau rollback, chạy lại health/readiness và smoke phù hợp. Báo cáo production phải chứa SHA, deployment IDs/build IDs, migration ID, digest, kết quả kiểm thử và rollback point; tuyệt đối không đưa credential hoặc PHI vào báo cáo.
