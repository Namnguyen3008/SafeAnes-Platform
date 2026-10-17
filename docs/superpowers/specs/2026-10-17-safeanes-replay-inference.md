# Thiết kế: inference không chặn replay/SSE và loại bỏ kết quả cũ

**Trạng thái:** Hướng thiết kế đã được duyệt; chờ người dùng review bản spec này.
**Phạm vi:** Scheduler, worker inference chạy nền, SSE replay và hiển thị live/cache trên frontend.

## Bối cảnh và vấn đề

Backend có `ReplayInferenceScheduler`, nhưng route SSE hiện không kết nối scheduler với luồng phát dữ liệu. Parser frontend đã nhận diện event `inference_result`, song context replay chưa xử lý event này. Nếu gọi inference trực tiếp trong vòng phát SSE, latency model/upstream có thể làm chậm waveform và chặn kết nối. Replay cũng cần bảo vệ khỏi kết quả của ca hoặc lần seek trước đến muộn.

## Mục tiêu

- Chỉ tạo inference tick khi playback thực sự ở trạng thái `PLAYING`.
- Đẩy inference sang worker nền để SSE tiếp tục phát data/control event đúng nhịp.
- Bỏ mọi kết quả thuộc generation/session cũ sau seek, đổi ca, stop, reconnect hoặc bắt đầu playback mới.
- Trình bày nguồn `LIVE_INFERENCE` và `OFFLINE_CACHE` riêng biệt; không dùng cache che lỗi live.
- Kết nối event `inference_result` từ backend tới UI với một contract ổn định.

## Thiết kế

### Trạng thái replay và scheduler

- Playback session có định danh ca, trạng thái playback và số `generation` tăng khi tạo session mới, đổi ca, seek/reset, stop rồi start lại hoặc reconnect làm mất đồng bộ.
- Scheduler chỉ lập inference tick trong `PLAYING`. `PAUSED`, `STOPPED`, `COMPLETE` và trạng thái chưa đồng bộ không tạo tick mới. Việc resume dùng vị trí replay hiện tại, không phát bù hàng loạt các tick đã lỡ.
- Worker inference chạy độc lập với vòng lặp SSE. Hàng đợi có giới hạn và coalesce tick đang chờ theo session để tăng tải không làm bộ nhớ tăng vô hạn. Giới hạn concurrency theo cấu hình backend.
- Job mang `session_id`, `generation`, `case_id`, `prediction_time_s`. Trước khi phát kết quả, worker so sánh các giá trị này với trạng thái hiện hành; mismatch thì bỏ kết quả và ghi metric/log an toàn, không phát vào stream hiện tại.
- Stop/seek/đổi ca hủy hoặc vô hiệu hóa job chưa chạy; job đang chạy có thể hoàn tất nhưng kết quả stale không được phát. Hủy không được làm mất các event waveform/control.

### SSE và frontend

- Giữ các event replay đang có (`snapshot`, `reset`, `data`, `complete`, `error`) và bổ sung/khôi phục event `inference_result` theo parser hiện hữu.
- Payload inference chứa session/generation, ca, prediction time, use-case/model version, horizons/results và trường `source` enum: `LIVE_INFERENCE` hoặc `OFFLINE_CACHE`.
- `LIVE_INFERENCE` chỉ được phát khi model vừa chạy thành công. Cached timeline phát từ đường offline riêng, được gắn `OFFLINE_CACHE`. Lỗi inference được biểu diễn rõ ràng; nó không thay bằng điểm cache hoặc điểm cố định.
- Frontend kiểm tra generation và case trước khi áp dụng kết quả; bỏ kết quả stale kể cả khi backend lọt một event cũ. UI giữ nhãn nguồn cạnh dự đoán và không đổi waveform timeline khi event inference lỗi.
- SSE timeout/reconnect khởi tạo generation mới hoặc đồng bộ snapshot theo quy tắc thống nhất; event của stream trước không được trộn vào session mới.

## Tương thích và phạm vi loại trừ

- Không thay thuật toán phát waveform/tốc độ replay ngoài những điều chỉnh cần để điều khiển scheduler theo trạng thái.
- Không đưa inference đồng bộ vào request loop SSE.
- Không thực hiện backfill tự động cho thời điểm pause; không giả định cache offline là inference trực tiếp.
- Workstream này phụ thuộc vào contract inference thật từ spec `safeanes-inference-contract`; khi contract đó chưa sẵn sàng, chỉ có thể kiểm thử worker với adapter/fixture rõ nguồn, không gắn nhãn live giả.

## Tiêu chí chấp nhận

- Test scheduler chứng minh `PLAYING` sinh tick; các trạng thái còn lại không tạo tick.
- Test SSE dùng inference chậm vẫn nhận các event `data`/control trong thời gian inference đang chạy.
- Test hàng đợi vượt tải chứng minh giới hạn bộ nhớ/concurrency và hành vi coalesce được giữ.
- Test seek, đổi ca, stop/start, reconnect chứng minh generation cũ bị loại ở backend lẫn frontend.
- Test kiểm tra contract payload và UI giữ nhãn `LIVE_INFERENCE`/`OFFLINE_CACHE` đúng; live lỗi không rơi về điểm cache.
- Kiểm thử luồng từ playback `PLAYING` tới SSE `inference_result` được chạy bằng mock/model fixture ổn định, rồi production smoke dùng model thật sau health/readiness gate.

## Rollout

Triển khai worker/scheduler có metric và feature flag nếu dự án đã có cơ chế phù hợp. Không tạo staging target theo quyết định rollout ngày 2026-10-17; kiểm tra tốc độ SSE, queue depth, stale-discard count và độ trễ inference trên production bằng case kiểm thử được phép, sau khi inference contract thật đã qua health/readiness và positive smoke qua FastAPI. Dừng rollout nếu replay làm nghẽn SSE hoặc phát kết quả generation cũ.
