# Thiết kế: đồng bộ cấu hình và luồng deploy SafeAnes

**Trạng thái:** Hướng thiết kế đã được duyệt; chờ người dùng review bản spec này.
**Phạm vi:** Frontend Vercel, API FastAPI trên Render, Lambda/ECR và kiểm tra readiness giữa các dịch vụ.

## Bối cảnh và vấn đề

Các cấu hình hiện tại lệch nhau ở những giá trị ảnh hưởng trực tiếp tới startup: Render đặt `SAFEANES_ALLOWED_HOSTS="*"` trong khi validator từ chối wildcard; Render trỏ model root vào `/app/models` nhưng Dockerfile đặt model dưới `/models`; cấu hình local dùng đường dẫn tương đối `../model` dù artifacts trong repo ở `./models`; giá trị cache ở Render khác default của backend. Những sai lệch này khiến cấu hình khai báo có thể không khởi động được hoặc không tìm thấy model dù build thành công.

## Mục tiêu

- Mỗi môi trường có config contract rõ ràng, được validator kiểm tra ngay khi khởi động.
- Docker image, Render Blueprint và model artifacts cùng dùng một đường dẫn model nhất quán.
- Host allowlist chỉ gồm host thật sự cần thiết và được kiểm thử với đường gọi production.
- Build/test/deploy/readiness kiểm tra được từng chặng Vercel → Render → Lambda mà không báo xanh giả.
- Giữ deploy hiện có của Vercel và Render; mô tả rõ quy trình đóng gói/push ECR và cập nhật Lambda theo repo, không giả định Lambda tự deploy theo Git nếu chưa được cấu hình.

## Thiết kế

### Contract cấu hình

- Tạo ma trận dev/test/production cho `SAFEANES_MODEL_ROOT`, `SAFEANES_ALLOWED_HOSTS`, giá trị cache, URLs dịch vụ và secret inference. Mỗi biến có kiểu, nơi được đọc, môi trường sở hữu và hành vi khi thiếu.
- Trong container Render, thư mục chứa weights và `SAFEANES_MODEL_ROOT` phải thống nhất. Chọn một đường dẫn container chuẩn (hiện Dockerfile copy artifacts vào `/models`) và để local dùng đường dẫn trong repository; không phụ thuộc thư mục cha ngoài checkout.
- `SAFEANES_ALLOWED_HOSTS` phải là danh sách host hợp lệ, được phân tích và kiểm tra theo cùng quy tắc giữa local và Render. Bỏ `*`; xác nhận host mà FastAPI thực nhận khi đi qua Vercel/proxy trước khi chốt allowlist.
- Giá trị cache production lấy từ cấu hình Blueprint có kiểm soát (hiện khai báo 24); default code chỉ là giá trị fallback cho môi trường không khai báo. Test cấu hình sẽ phát hiện drift giữa biến triển khai và parser/default được tài liệu hóa.
- Secret backend-to-Lambda chỉ ở kho secret của dịch vụ; không đặt trong `NEXT_PUBLIC_*`, Blueprint công khai hoặc image layer.

### Chuỗi deploy và readiness

1. CI chạy frontend build, backend unit/integration tests, kiểm tra cấu hình, kiểm tra model paths và build Docker image.
2. Merge/push lên nhánh production kích hoạt các dịch vụ đang bật auto-deploy: Vercel cho frontend và Render cho backend. Trạng thái auto-deploy cần được xác minh trong cấu hình dịch vụ; plan không được coi là đã có nếu chưa xác minh.
3. Lambda được build thành container, push lên ECR, rồi cập nhật image của function bằng workflow hiện có. Ghi lại image digest/version để backend và log có thể đối chiếu.
4. Sau deploy, kiểm tra frontend 200, backend liveness/readiness, model readiness cho cả hai use-case, kết nối Lambda và API inference. Health endpoint không được đánh dấu model sẵn sàng chỉ vì process HTTP đang chạy.
5. Chạy smoke test inference qua FastAPI, kiểm tra nguồn/kết quả, rồi smoke test SSE replay. Nếu bước nào không đạt, dừng promote và hướng dẫn rollback theo phiên bản image/deployment.

## Tương thích và phạm vi loại trừ

- Không thay nền tảng hosting; không chuyển Vercel/Render/Lambda sang nhà cung cấp khác.
- Không thay đổi schema Supabase hoặc chính sách RLS trong spec này; schema là một workstream riêng.
- Không deploy production, sửa secret production hay cập nhật function Lambda trong quá trình soạn spec/plan.
- Các tài liệu cũ đang bị xóa trong working tree không được khôi phục hay thay thế như một phần của thay đổi này.

## Tiêu chí chấp nhận

- Test config chấp nhận host allowlist hợp lệ, từ chối wildcard/giá trị sai và fail-fast với cấu hình bắt buộc bị thiếu.
- Test/CI chứng minh model path trong Docker image trùng với runtime config; readiness báo lỗi có thể chẩn đoán khi artifacts không tồn tại.
- Một kiểm tra parity xác nhận Blueprint, default và tài liệu thống nhất cho các config có giá trị mặc định/production.
- Build frontend và backend Docker thành công trong runner tương thích; test suite backend đạt.
- Checklist deploy nêu rõ trigger, artifact/version, health checks, smoke tests, dấu hiệu thành công và rollback cho Vercel, Render, Lambda.
- Các endpoint liveness/readiness và production smoke test phân biệt lỗi app, model, token và upstream.

## Ràng buộc rollout

Trước khi rollout, xác minh cấu hình thực tế của Render/Vercel/Lambda bằng thông tin đọc được, ghi rollback point và chạy CI trên đúng SHA. Theo quyết định ngày 2026-10-17, rollout nhắm production trực tiếp, không tạo staging; platform secret chỉ được cập nhật trong secret store và phải khớp giữa Render/Lambda. Dừng trước Lambda publish nếu production workspace hoặc token parity chưa xác minh. Không tuyên bố deploy hoàn tất chỉ dựa trên build thành công.
