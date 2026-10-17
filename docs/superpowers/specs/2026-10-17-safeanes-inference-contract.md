# Thiết kế: khôi phục inference thật cho UC04/UC05

**Trạng thái:** Hướng thiết kế đã được duyệt; chờ người dùng review bản spec này.
**Phạm vi:** Hợp đồng inference giữa Vercel/frontend, FastAPI trên Render và Lambda chạy model.

## Bối cảnh và vấn đề

Luồng hiện tại có thể gọi Lambda chỉ với mã ca và thời điểm dự đoán. Khi Lambda không nhận được tensor đầu vào, code trả điểm hằng số thay cho kết quả model. Đường gọi từ Next.js và đường gọi Lambda từ backend cũng chưa chuyển dữ liệu model đã chuẩn bị. Vì vậy một request có thể trông như inference thành công trong khi không chạy model thực.

## Mục tiêu

- FastAPI là nơi điều phối và sở hữu việc chọn ca, đọc tín hiệu, tiền xử lý, kiểm tra input, gọi model và chuẩn hóa kết quả.
- Lambda chỉ thực thi model trên input đầy đủ, có phiên bản hợp đồng rõ ràng.
- Lỗi, thiếu dữ liệu và model chưa sẵn sàng được trả thành trạng thái lỗi tường minh; không có điểm, horizon hay tensor giả làm fallback.
- Bảo vệ lời gọi backend-to-Lambda bằng service token; token không xuất hiện trong frontend, URL, log hoặc phản hồi API.
- Phân biệt kết quả inference đang chạy với cache offline bằng nguồn dữ liệu có kiểu rõ ràng.

## Thiết kế

### Phân chia trách nhiệm

1. Client gửi yêu cầu replay/inference tới FastAPI qua API hiện hành. Client không gọi Lambda trực tiếp.
2. FastAPI kiểm tra ca, thời điểm và trạng thái model; tải chuỗi tín hiệu chuẩn của ca; tạo tensor theo contract riêng của UC04 hoặc UC05; kiểm tra dữ liệu bắt buộc, cửa sổ thời gian, kích thước, kiểu số và giá trị hữu hạn.
3. FastAPI gửi request phiên bản hóa đến Lambda. Request có model/use-case, `case_id`, `prediction_time_s`, dữ liệu đã chuẩn bị và metadata cần thiết để kiểm tra contract. Lambda xác thực service token trước khi xử lý.
4. Lambda nạp và chạy model được chỉ định, rồi trả dự đoán cùng model/version và horizon thực tế. Lambda không đọc Supabase/VitalDB, không tự suy đoán tensor và không quyết định dùng cache.
5. FastAPI kiểm tra response, gắn provenance/source, rồi trả kết quả chuẩn hóa cho client.

### Hợp đồng và lỗi

- Request có `contract_version`; tensor UC04/UC05 có schema, dtype, chiều, thứ tự feature, cửa sổ đầu vào và đơn vị được tài liệu hóa theo model hiện có. Các horizon phải khớp model tương ứng; UC04 và UC05 không dùng chung danh sách horizon nếu model contract khác nhau.
- Response chỉ được đánh dấu thành công khi Lambda thực sự hoàn tất forward pass và tạo output hợp lệ. Response gồm ít nhất use-case/model version, `case_id`, thời điểm dự đoán, dự đoán theo horizon, thời gian xử lý và `source=LIVE_INFERENCE`.
- Sentinel missing được định nghĩa rõ theo tensor: numeric dùng JSON `null` khi `numeric_mask` bằng 0 và Lambda đổi giá trị đó thành 0 trước forward; static dùng JSON `null`, Lambda giữ NaN để UC04/UC05 tạo presence mask từ `isfinite` rồi chuẩn hóa như kiến trúc model. Infinity và NaN ở waveform/mask hoặc numeric không được mask bị từ chối.
- `latency_ms` là thời gian Lambda bắt buộc, hữu hạn và không âm. Backend xác thực trường này; SSE/API tiếp tục hiển thị latency tổng từ FastAPI đến khi kết thúc inference, không thay bằng riêng thời gian Lambda.
- Thiếu tín hiệu bắt buộc, input sai shape/đơn vị, dữ liệu không hữu hạn ngoài các sentinel missing được định nghĩa ở trên, model không tải được, token sai, timeout hoặc output không hợp lệ đều trả lỗi có mã và thông tin an toàn để chẩn đoán. Không chuyển lỗi đó thành điểm 0, điểm cố định, horizon mẫu hoặc kết quả cũ.
- Cache offline là một đường đọc riêng với `source=OFFLINE_CACHE`, không phải fallback cho lỗi của live inference. UI phải giữ nguyên nhãn nguồn và không trình bày cache như kết quả model mới.
- Token được cấu hình riêng ở backend và Lambda bằng secret phía server. Xác thực phải xảy ra trước khi nạp input hoặc gọi model; so sánh token an toàn, không ghi token vào log. Vòng đời/rotation của token thuộc cấu hình deploy.

## Tương thích và phạm vi loại trừ

- Giữ endpoint public hiện có ở FastAPI nếu có thể; thay đổi contract nội bộ backend-Lambda và bổ sung trường nguồn có kiểu.
- Loại bỏ mọi nhánh trả dự đoán cố định khi thiếu tensor. Không thay đổi trọng số, kiến trúc hoặc ý nghĩa lâm sàng của model trong công việc này.
- Không triển khai trực tiếp từ trình duyệt tới Function URL, không thêm logic truy xuất dữ liệu vào Lambda, không biến cache thành kết quả live.
- Thay đổi giao diện cần tiếp tục hiển thị replay/cache hiện có, nhưng phải làm rõ nguồn và lỗi inference.

## Tiêu chí chấp nhận

- Test xác nhận Lambda từ chối service token thiếu/sai và không gọi model trong trường hợp đó.
- Test với tensor hợp lệ chứng minh UC04/UC05 đi qua model thật và response khớp schema/horizon của model.
- Test thiếu input, sai shape, NaN/Inf, model chưa sẵn sàng, timeout và output lỗi đều nhận lỗi có kiểu, không nhận điểm mặc định.
- Test API xác nhận `LIVE_INFERENCE` chỉ xuất hiện sau khi model chạy thành công; cache offline luôn được gắn `OFFLINE_CACHE`.
- Tích hợp backend-to-Lambda dùng contract test hoặc fixture đã version hóa; không cần gọi dịch vụ production để chạy unit test.
- Kiểm tra end-to-end ở môi trường deploy chứng minh request từ client qua FastAPI tới Lambda và trở về có provenance nhất quán.

## Triển khai

Đưa contract và kiểm thử vào code trước; khi triển khai, cấu hình cùng `SAFEANES_INFERENCE_SERVICE_TOKEN` ở Render/Lambda bằng secret store. Theo quyết định rollout ngày 2026-10-17, không dùng staging; triển khai production sau khi CI, health/readiness và cấu hình token parity được xác nhận. Phép thử live UC04/UC05 qua FastAPI cùng provenance là gate bắt buộc sau deploy; nếu chưa thể truy cập đúng Render service thì không cập nhật Lambda.
