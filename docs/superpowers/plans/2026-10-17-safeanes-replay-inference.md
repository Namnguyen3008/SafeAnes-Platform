# Kế hoạch nối replay với live inference và SSE

> **Dành cho agent thực thi:** BẮT BUỘC dùng skill superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để triển khai từng task. Đánh dấu tiến độ bằng checkbox.

**Goal:** Nối playback replay với live inference mà không làm chậm SSE data và loại bỏ kết quả trễ thuộc generation replay đã cũ.

**Architecture:** Giữ ReplayInferenceScheduler và LiveInferenceWorker hiện có, bổ sung giới hạn tác vụ đang chạy/đang chờ và tối đa một scheduling task cho mỗi SSE stream. Kết quả/lỗi chỉ được phát sau khi kiểm tra generation. Frontend nhận các event inference_result và inference_error riêng, đồng thời giữ live predictions tách biệt với offline cache.

**Tech Stack:** Python 3.12, FastAPI, asyncio, ThreadPoolExecutor, React 19, TypeScript 5.9, EventSource, pytest, Node node:test.

**Spec:** docs/superpowers/specs/2026-10-17-safeanes-replay-inference.md

## Global Constraints — Ràng buộc chung

- Scheduler chỉ phát inference tick khi session có status == PLAYING.
- SSE generator không chờ model chạy; replay snapshot/data/control tiếp tục được phát trong lúc inference hoạt động.
- Mỗi stream có tối đa một scheduling task; tổng số job đang chạy và xếp hàng của worker không vượt 8. Các tick đến trong lúc worker bận được gộp lại thành vị trí replay mới nhất.
- Mỗi job/result mang session_id, generation, case_id và prediction_time.
- Bỏ kết quả/lỗi nếu session, case hoặc generation không còn khớp replay hiện tại.
- Kết quả trực tiếp dùng LIVE_INFERENCE; output cache giữ OFFLINE_CACHE; hai nguồn không thay thế lẫn nhau.
- Plan phụ thuộc contract real inference có version trong 2026-10-17-safeanes-inference-contract.md; không gắn nhãn live cho output giả.

## Review Focus — Trọng tâm review

- Pause, stop, complete hoặc trạng thái chưa đồng bộ vẫn kích hoạt inference: scheduler tests xác nhận worker không được gọi; Task 1.
- Inference chậm làm nghẽn replay frame hoặc tạo backlog không giới hạn: delayed-worker/capacity tests xác nhận SSE vẫn tiến triển và worker giới hạn ở 8; Tasks 1 và 2.
- Seek/reset/restart khiến kết quả generation cũ xuất hiện: integration tests xác nhận kết quả bị bỏ; Task 2.
- Worker exception bị nuốt và bị hiểu thành “không có rủi ro”: worker phát typed error event an toàn; Tasks 1 và 2.
- Frontend reconnect/chuyển case hiển thị event của session khác: parser/context tests xác nhận session, case, generation; Task 3.
- Offline predictions bị trình bày như output model mới: UI giữ các collection riêng và gắn source label; Task 3.

---

### Task 1: Chỉ schedule khi replay đang chạy và giới hạn inference work nền

**Files:**
- Sửa: backend/app/services/replay/replay_scheduler.py
- Sửa: backend/app/services/inference/inference_worker.py
- Sửa: backend/app/services/replay/manager.py
- Sửa: backend/app/schemas/api.py
- Kiểm thử mới: backend/tests/test_replay_scheduler.py

**Interfaces:**
- Đầu vào: ReplaySession snapshot có session_id, case_id, status, current_time_seconds, speed và generation.
- Đầu ra: ReplayInferenceScheduler.schedule_if_due(session: dict[str, Any]) -> list[LiveInferenceResult | LiveInferenceFailure]; trả list rỗng trừ khi session là PLAYING. LiveInferenceWorker.execute_async(...) báo InferenceCapacityError và không queue khi tổng số slot chạy/chờ đã đạt 8. LiveInferenceResult.as_dict() đặt source="LIVE_INFERENCE"; LiveInferenceFailure.as_dict() phát event="inference_error" với safe error code và các trường session/generation/case/time tương ứng.

- [ ] **Step 1: Viết scheduler, capacity, generation và error tests trước**

  Tạo backend/tests/test_replay_scheduler.py với test_scheduler_does_not_submit_when_not_playing, test_worker_rejects_submission_when_eight_jobs_are_pending, test_scheduler_retries_latest_position_after_capacity_is_available, test_worker_returns_typed_failure_without_exception_details và test_restart_from_completed_session_advances_generation. Dùng fake inference callable để các kiểm thử này không cần model thật hoặc Supabase.

- [ ] **Step 2: Chạy test replay tập trung và xác nhận chúng thất bại**

  Chạy: python -m pytest backend/tests/test_replay_scheduler.py -q
  Kết quả mong đợi: FAIL vì scheduler chưa chặn theo playback status, executor chưa giới hạn submission rõ ràng và worker hiện chuyển exception thành None.

- [ ] **Step 3: Thêm job/failure có kiểu, capacity guard và status guard**

  Trong inference_worker.py, giữ hai executor threads hiện có và thêm capacity guard không chặn với tổng giới hạn 8; nhả slot trong finally và raise InferenceCapacityError khi hết chỗ. Khi execution lỗi, trả LiveInferenceFailure với safe code ổn định thay vì log exception text rồi trả None. Trong replay_scheduler.py, nhận replay snapshot và dừng trước evaluation nếu status không phải PLAYING; khi gặp InferenceCapacityError thì không đánh dấu model/time đã evaluated để lần gọi tiếp theo dùng vị trí mới nhất; gắn generation vào result. Trong manager.py, tăng generation khi replay chạy lại từ COMPLETED; giữ các lần tăng hiện có khi seek/reset. Thêm generation vào ReplaySessionResponse nếu contract hiện tại chưa có.

- [ ] **Step 4: Chạy scheduler/worker tests và regression replay controls**

  Chạy: python -m pytest backend/tests/test_replay_scheduler.py backend/tests/test_api_backend.py::test_replay_controls_stream_one_way_state_and_validate_seek -q
  Kết quả mong đợi: PASS; queue submission bị từ chối không chặn caller và lần due-check kế tiếp dùng thời điểm hiện hành của session.

- [ ] **Step 5: Commit**

      git add backend/app/services/replay/replay_scheduler.py backend/app/services/inference/inference_worker.py backend/app/services/replay/manager.py backend/app/schemas/api.py backend/tests/test_replay_scheduler.py
      git commit -m "feat: gate and bound replay inference work"

### Task 2: Nối kết quả inference vào SSE mà không làm nghẽn stream

**Files:**
- Sửa: backend/app/api/routes/replay.py
- Kiểm thử: backend/tests/test_api_backend.py

**Interfaces:**
- Đầu vào: ReplayInferenceScheduler.schedule_if_due(session: dict[str, Any]) và payload result/failure as_dict() từ Task 1.
- Đầu ra: stream_session(session_id, request) giữ tối đa một asyncio.Task inference cho mỗi stream, chỉ schedule khi PLAYING, chỉ phát inference_result/inference_error nếu session_id/case_id/generation hiện tại vẫn khớp; vẫn phát snapshot, reset, data, complete và error trong lúc worker chạy.

- [ ] **Step 1: Viết SSE integration tests đang thất bại**

  Thêm test_replay_stream_emits_data_while_inference_is_slow, test_replay_stream_does_not_schedule_inference_when_paused, test_replay_stream_discards_result_from_old_generation và test_replay_stream_emits_safe_inference_error_event vào backend/tests/test_api_backend.py. Dùng fake worker điều khiển bằng asyncio.Event; xác nhận data được quan sát trước khi worker được mở khóa.

- [ ] **Step 2: Chạy test mới và xác nhận route hiện tại thất bại**

  Chạy: python -m pytest backend/tests/test_api_backend.py -k 'replay_stream_emits_data_while_inference_is_slow or replay_stream_does_not_schedule_inference_when_paused or replay_stream_discards_result_from_old_generation or replay_stream_emits_safe_inference_error_event' -q
  Kết quả mong đợi: FAIL vì stream_session hiện chưa gọi scheduler.

- [ ] **Step 3: Thêm scheduling nền và kiểm tra generation hiện tại trong stream_session**

  Trong SSE generator, lưu latest inference snapshot theo từng vòng lặp. Chỉ tạo asyncio.create_task(runtime.replay_scheduler.schedule_if_due(snapshot)) khi playback là PLAYING và chưa có task đang chạy. Nếu task còn pending thì cập nhật snapshot mới nhất nhưng không tạo task thứ hai; ngay khi task xong, lấy snapshot mới nhất để schedule lần tiếp theo nếu session vẫn PLAYING và đã đến hạn. Mỗi khi task hoàn tất, reload session hiện tại trước khi phát kết quả; bỏ result/error nếu session/case/generation khác. Nếu task vẫn chạy, tiếp tục phát replay frame và sleep theo chu kỳ 0.5 giây hiện có; không khởi chạy thêm task. Phát lỗi inference an toàn bằng inference_error nhưng không dừng waveform streaming.

- [ ] **Step 4: Chạy SSE tests mới và replay regressions hiện có**

  Chạy: python -m pytest backend/tests/test_api_backend.py -q
  Kết quả mong đợi: PASS; catch-up coalescing, seek validation, no-future-leakage và intermediary-transform checks hiện có không đổi.

- [ ] **Step 5: Commit**

      git add backend/app/api/routes/replay.py backend/tests/test_api_backend.py
      git commit -m "feat: stream replay inference without blocking data"

### Task 3: Parse inference event và tách state live/cache ở frontend

**Files:**
- Sửa: src/services/inferenceEventClient.ts
- Sửa: src/context/UC04VitalDbContext.tsx
- Sửa: src/components/modules/replay/VitalDBReplayWorkspace.tsx
- Sửa: src/lib/api/safeanesClient.ts
- Tạo: tests/inference-event-client.test.cjs

**Interfaces:**
- Đầu vào: SSE event names và payload từ Task 2.
- Đầu ra: LiveInferenceEventPayload = LiveInferenceResultPayload | LiveInferenceErrorPayload; parseInferenceEvent(eventName: "inference_result" | "inference_error", raw: string) -> LiveInferenceEventPayload | null; isCurrentReplayEvent(payload: LiveInferenceEventPayload, session: ReplaySessionResponse | null) -> boolean; UC04VitalDbContextValue có thêm liveInferenceResults và liveInferenceErrors mà không thay uc04Predictions/uc05Predictions lấy từ cached views.

- [ ] **Step 1: Viết parser và generation-filter tests trước**

  Thêm Node tests parses_live_inference_result_with_source, parses_safe_inference_error, rejects_malformed_or_unknown_inference_event và rejects_events_for_another_session_case_or_generation. Dùng cách transpile TypeScript hiện có trong tests/safeanes-client.test.cjs làm mẫu.

- [ ] **Step 2: Chạy Node tests mới và xác nhận chúng thất bại**

  Chạy: node --test tests/inference-event-client.test.cjs
  Kết quả mong đợi: FAIL vì parser hiện chỉ nhận inference_result và replay context chưa lắng nghe event này.

- [ ] **Step 3: Cài đặt typed event client và context listeners**

  Bắt buộc source: "LIVE_INFERENCE" trên result payload; định nghĩa error payload chỉ có code ổn định, session/case/generation, model và prediction time. Export isCurrentReplayEvent(payload, session) từ inferenceEventClient.ts và dùng để chặn event sai session/case/generation. Gắn rồi tháo listener inference_result và inference_error bên cạnh snapshot/reset/data listeners trong UC04VitalDbContext.tsx. Xóa live result/error state khi reset case/session. Không gộp live value vào offline cache prediction arrays.

- [ ] **Step 4: Hiển thị source và nhãn lỗi trong replay workspace**

  Hiển thị live UC04/UC05 result mới nhất cùng LIVE_INFERENCE, model, prediction time và horizon values; hiện trạng thái không khả dụng/lỗi rõ ràng cho inference_error. Cached predictions vẫn mang nhãn OFFLINE_CACHE; không hiển thị cache thay cho live inference thất bại.

- [ ] **Step 5: Chạy parser tests và frontend build**

  Chạy: node --test tests/inference-event-client.test.cjs tests/safeanes-client.test.cjs và npm run build
  Kết quả mong đợi: PASS; TypeScript kiểm tra event union và UI giữ riêng live/cache state.

- [ ] **Step 6: Commit**

      git add src/services/inferenceEventClient.ts src/context/UC04VitalDbContext.tsx src/components/modules/replay/VitalDBReplayWorkspace.tsx src/lib/api/safeanesClient.ts tests/inference-event-client.test.cjs
      git commit -m "feat: display sourced live replay inference"

### Task 4: Xác minh luồng playback → SSE → UI

**Files:**
- Kiểm thử: backend/tests/test_api_backend.py
- Kiểm thử: backend/tests/test_replay_scheduler.py
- Kiểm thử: tests/inference-event-client.test.cjs
- Kiểm thử: tests/integration/vitaldb-replay.spec.ts

**Interfaces:**
- Đầu vào: Tasks 1–3 và contract prepared-input thật từ plan inference.
- Đầu ra: Kiểm thử local lặp lại được cùng checklist staging chứng minh replay controls, live result, cache label và generation filtering hoạt động end-to-end.

- [ ] **Step 1: Chạy backend scheduler và SSE tests tập trung**

  Chạy: python -m pytest backend/tests/test_replay_scheduler.py backend/tests/test_api_backend.py -q
  Kết quả mong đợi: PASS mà không gọi AWS/Supabase production.

- [ ] **Step 2: Chạy frontend event tests và build**

  Chạy: node --test tests/inference-event-client.test.cjs tests/safeanes-client.test.cjs và npm run build
  Kết quả mong đợi: PASS; không lỗi type và không regression khi parse event.

- [ ] **Step 3: Chạy replay integration test trong local environment đã cấu hình**

  Chạy: npx playwright test --config tests/integration/playwright.config.ts tests/integration/vitaldb-replay.spec.ts
  Kết quả mong đợi: PASS khi local backend/data fixtures sẵn sàng; test xác nhận waveform tiếp tục chạy trong lúc inference pending và source được ghi nhãn riêng.

- [ ] **Step 4: Smoke test staging sau khi inference contract đã được triển khai**

  Replay một case, pause, seek, chuyển case, resume và reconnect stream. Xác nhận chỉ PLAYING mới schedule work, không có stale generation event, inference chậm/lỗi không làm trễ waveform SSE data.
