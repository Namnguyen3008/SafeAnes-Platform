# Thiết kế: contract schema và quyền truy cập dữ liệu VitalDB

**Trạng thái:** Hướng thiết kế đã được duyệt; chờ người dùng review bản spec này.
**Phạm vi:** Migration bổ sung các bảng `safeanes_*`, client PostgREST và script ingest VitalDB.

## Bối cảnh và vấn đề

Migration hiện có tạo các bảng nghiệp vụ `clinical_*`, nhưng chưa định nghĩa bốn bảng `safeanes_*` mà script ingest ghi và frontend đọc: cases, tracks, events và signal windows. Client truy cập qua anon key trong trình duyệt; script ingest hiện cũng dựa vào cấu hình public/anon để ghi. Thiếu schema/policy thống nhất làm cho ingest, API và UI có thể không chạy cùng contract, đồng thời không phân tách được quyền đọc công khai với quyền ghi của pipeline.

## Mục tiêu

- Định nghĩa schema additive cho đúng bốn bảng VitalDB mà code hiện dùng.
- Bảo đảm client chỉ đọc dữ liệu VitalDB đã chọn lọc; không có quyền ghi từ `anon` hoặc `authenticated`.
- Chuyển quyền ingest sang credential server-only, không dùng biến `NEXT_PUBLIC_*` để ghi.
- Không làm thay đổi các bảng hoặc RLS policy `clinical_*`.
- Đối chiếu schema/policy thật trước rollout và kiểm thử migration/RLS ở local trước khi áp dụng database từ xa.

## Thiết kế

### Schema tương thích

Migration mới tạo (nếu chưa tồn tại) các bảng:

- `safeanes_cases`: mã/nguồn case, metadata nhân khẩu học đã chọn lọc, thông tin ca, thời lượng, số track, cờ waveform, review status và metadata.
- `safeanes_tracks`: `case_id`, mã/tên signal, device, sample rate, unit, duration và metadata.
- `safeanes_events`: `case_id`, thời điểm, loại/tên/value/unit, source system và provenance reference.
- `safeanes_signal_windows`: `case_id`, start/end, observations, waveforms và output UC04/UC05.

Tên cột, khả năng null, kiểu JSON/numeric/text/timestamp, format `id` và quy tắc uniqueness/upsert phải khớp chính xác với `scripts/ingest_vitaldb_to_supabase.py` và các row interface/query trong `src/lib/api/supabaseVitalDbClient.ts`. Ràng buộc tham chiếu, check `window_end_s >= window_start_s`, index theo `case_id` và cột thời gian dùng để lọc phải hỗ trợ truy vấn hiện tại. Migration không drop/rename bảng/cột và không ghi đè dữ liệu đã có.

### RLS và credential

- Bật RLS trên cả bốn bảng thuộc exposed schema.
- Vì UI hiện đọc dataset VitalDB được tuyển chọn bằng public anon client, policy chỉ cho `SELECT` tới `anon` và `authenticated` trên bốn bảng này. Không tạo policy `INSERT`, `UPDATE` hoặc `DELETE` cho hai role đó; cấp đúng quyền đọc tối thiểu.
- Không áp dụng quyền public này cho bảng `clinical_*` hay dữ liệu khác. Nếu kiểm tra dữ liệu production phát hiện có trường không được phép công khai, phải dừng rollout và sửa contract phân quyền trước khi triển khai.
- Script ingest nhận `SUPABASE_SERVICE_ROLE_KEY` (hoặc secret server-side tương đương đã được xác minh với cách gọi PostgREST hiện tại) từ môi trường thực thi pipeline. Không hardcode key, không đọc key từ `NEXT_PUBLIC_*`, không gửi key về client và không log giá trị key.
- Credential ghi được dùng riêng cho pipeline ingest; backend/UI runtime chỉ có credential đọc công khai cần thiết.

### Kiểm soát schema và migration

Trước khi viết migration triển khai, đọc schema/policies/indexes của Supabase đích ở chế độ chỉ đọc và so sánh với migration repo cùng payload ingest/client. Migration local phải áp dụng được trên cơ sở dữ liệu sạch và không phá schema đã tồn tại; nếu bảng `safeanes_*` đã có trên production, lập kế hoạch reconcile rõ ràng thay vì giả định migration tạo mới.

## Tương thích và phạm vi loại trừ

- Giữ nguyên URL/query contract của client và payload/upsert contract của script trừ khi test phát hiện bất tương thích; nếu cần đổi, cập nhật cả hai cùng migration.
- Không chỉnh `clinical_cases`, `clinical_events`, `clinical_audit_log`, `model_predictions`, `profiles` hoặc policy của chúng.
- Không chạy migration trên production, không ingest dữ liệu production và không thay secret từ xa trong giai đoạn viết spec/plan.
- Đây là quyền đọc cho VitalDB đã chọn lọc theo thiết kế hiện hành; không mở public quyền ghi để đơn giản hóa ingest.

## Tiêu chí chấp nhận

- Migration local tạo đúng bốn bảng và các cột/constraint cần cho toàn bộ trường ingest/client sử dụng.
- Kiểm tra schema tự động phát hiện thiếu/thừa trường contract giữa migration, TypeScript row interfaces và payload script ingest.
- RLS tests chứng minh `anon`/`authenticated` đọc được các dòng VitalDB phù hợp nhưng không thể insert/update/delete; credential ingest server-only có thể upsert theo chính sách dự kiến.
- Test client thực hiện các truy vấn ca, tracks, events và signal windows bằng anon key trên dữ liệu fixture.
- Test ingest chạy dry-run và upsert fixture ở local; lỗi thiếu credential ghi thông báo cấu hình rõ ràng và không rơi về anon key.
- Các bảng/policy `clinical_*` sau migration có cùng quyền và cấu trúc như trước.

## Rollout

Chạy migration và RLS tests trên local trước. Theo user authorization ngày 2026-10-17, bỏ staging và có thể áp dụng migration production sau khi preflight dữ liệu/quyền đạt; kiểm tra migration history, RLS/grants, và xác nhận policy/schema `clinical_*` không đổi. Migration schema không tự động cho phép ingest: chỉ ingest riêng khi có batch được chọn và credential server-side sẵn sàng. Ghi migration ID và cách rollback tiến tới cho mọi thao tác production.
