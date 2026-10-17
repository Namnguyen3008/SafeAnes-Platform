# Kế hoạch bổ sung schema VitalDB và phân quyền Supabase

> **Dành cho agent thực thi:** BẮT BUỘC dùng skill superpowers:subagent-driven-development (khuyến nghị) hoặc superpowers:executing-plans để triển khai từng task. Đánh dấu tiến độ bằng checkbox.

**Goal:** Bổ sung bốn bảng VitalDB còn thiếu, có schema và quyền truy cập được kiểm thử; UI chỉ đọc các ca đã chọn lọc, còn chỉ pipeline ingest chạy ở server mới được ghi.

**Architecture:** Đọc schema project đã liên kết ở chế độ chỉ đọc, sau đó thêm migration local chỉ bổ sung cho safeanes_cases, safeanes_tracks, safeanes_events và safeanes_signal_windows. Dùng pgTAP kiểm thử schema/RLS, chuyển ingest sang service credential chỉ có ở server và kiểm thử parity giữa client với payload ingest mà không tác động các bảng clinical_* hiện có.

**Tech Stack:** Supabase Postgres 15+, Supabase CLI, pgTAP, PostgREST, Python 3.12/httpx, TypeScript 5.9, pytest, Node node:test.

**Spec:** docs/superpowers/specs/2026-10-17-safeanes-supabase-vitaldb-schema.md

## Global Constraints — Ràng buộc chung

- Migration chỉ được bổ sung; không drop/rename bảng/cột hiện có hoặc ghi đè dữ liệu.
- Bật RLS trên cả bốn bảng safeanes_*.
- Chỉ cấp SELECT cho anon và authenticated trên các bảng VitalDB đã chọn lọc; hai role này không có write grant hoặc write policy.
- scripts/ingest_vitaldb_to_supabase.py chỉ ghi bằng SUPABASE_SERVICE_ROLE_KEY dùng phía server; không fallback sang public/anon key.
- Không đưa service credential vào browser, commit, NEXT_PUBLIC_* hoặc log.
- Bảo toàn tất cả bảng và policy clinical_* hiện tại.
- Trước rollout remote, kiểm tra schema/policy/index production ở chế độ chỉ đọc và xử lý mọi object safeanes_* đã tồn tại.
- Chỉ chạy supabase db reset trên local stack; không thêm --linked hoặc --db-url vào lệnh reset.

## Review Focus — Trọng tâm review

- Kiểu id hoặc JSON/scalar field không khớp payload ingest: schema/client/ingest parity tests bao phủ field name và value shape hiện tại; Tasks 1 và 3.
- anon/authenticated có thể ghi VitalDB rows: pgTAP chứng minh SELECT thành công nhưng INSERT/UPDATE/DELETE bị từ chối; Task 1.
- Ingest fallback sang public key hoặc dry-run đòi write secret: tests bao phủ cả hai nhánh; Task 2.
- Query overlap signal-window thiếu index trên case/time columns: pgTAP xác nhận named case/window index tồn tại, Node test cố định cả hai overlap bounds; Tasks 1 và 3.
- Migration làm thay đổi quyền trên clinical tables: pgTAP kiểm tra tên/role của policy hiện hữu và review xác nhận migration không sửa chúng; Task 1.

---

### Task 1: Thêm local Supabase setup, schema mở rộng và pgTAP RLS tests

**Files:**
- Tạo: supabase/config.toml
- Tạo: supabase/migrations/20261017000000_safeanes_vitaldb_contract.sql
- Tạo: supabase/tests/database/safeanes_vitaldb.test.sql
- Preflight chỉ đọc: schema, policy, index và các safeanes_* object trên Supabase đã liên kết

**Interfaces:**
- Đầu vào: Payload insert/upsert hiện có trong scripts/ingest_vitaldb_to_supabase.py và row/query contract trong src/lib/api/supabaseVitalDbClient.ts.
- Đầu ra: Bốn bảng khớp field contract: cases (id,dataset_id,subject_id,age,sex,height,weight,bmi,asa,op_name,department,duration_s,track_count,has_waveforms,review_status,metadata); tracks (id,case_id,signal_code,signal_name,device,sample_rate_hz,unit,duration_s,metadata); events (id,case_id,timestamp_s,event_type,name,value,unit,source_system,provenance_ref); windows (id,case_id,window_start_s,window_end_s,observations,waveforms,predictions_uc04,predictions_uc05). Dùng TEXT cho id, numeric cho giây tương đối của case, JSONB cho metadata/observations/waveforms/predictions/value lồng nhau, foreign key theo case, constraint window_end_s >= window_start_s, upsert key id và index cho truy vấn case/time.

- [ ] **Step 1: Đọc schema remote trước khi viết migration**

  Dùng Supabase read-only schema/table/policy tools đã kết nối để ghi lại bốn bảng hiện có hay chưa, gồm cột, index và RLS policy. Không chạy SQL tạo/sửa/xóa/reset object remote. Nếu contract tồn tại một phần, ghi rõ kế hoạch reconcile trong task này và chưa áp dụng migration cho đến khi hiểu đầy đủ delta schema.

- [ ] **Step 2: Khởi tạo Supabase CLI local và viết pgTAP tests đang thất bại**

  Chạy supabase init nhưng không thay thế migrations directory hiện có. Tạo supabase/tests/database/safeanes_vitaldb.test.sql với assertions cho đủ bốn bảng/cột bắt buộc, RLS enabled, SELECT của anon và authenticated, write bị từ chối với hai role này, service-role upsert, foreign key/window constraints, cùng tên/role policy clinical không đổi.

- [ ] **Step 3: Chỉ start/reset database local và xác nhận test mới thất bại**

  Chạy: supabase start, supabase db reset và supabase test db supabase/tests/database/safeanes_vitaldb.test.sql
  Kết quả mong đợi: FAIL vì migration local hiện chỉ tạo bảng clinical_*. Không dùng --linked hoặc --db-url.

- [ ] **Step 4: Tạo migration chỉ bổ sung**

  Thêm định nghĩa bốn bảng, constraints, foreign keys, indexes, ENABLE ROW LEVEL SECURITY và SELECT grants/policies rõ ràng cho anon cùng authenticated. Không thêm public write grants/policies. Chỉ cấp quyền ghi pipeline cho service_role. Không sửa 20261011_init_safeanes.sql hoặc bất kỳ bảng/policy clinical_* nào.

- [ ] **Step 5: Reset và kiểm thử database local**

  Chạy: supabase db reset, supabase test db supabase/tests/database/safeanes_vitaldb.test.sql và supabase db lint --level error
  Kết quả mong đợi: PASS; bốn bảng mới khớp client/ingest contract và clinical policy assertions không đổi.

- [ ] **Step 6: Commit local config, migration và pgTAP tests**

      git add supabase/config.toml supabase/migrations/20261017000000_safeanes_vitaldb_contract.sql supabase/tests/database/safeanes_vitaldb.test.sql
      git commit -m "feat: add protected Supabase VitalDB schema"

### Task 2: Tách write credential của ingest khỏi quyền đọc public

**Files:**
- Sửa: scripts/ingest_vitaldb_to_supabase.py
- Kiểm thử: backend/tests/test_supabase_vitaldb_ingest.py

**Interfaces:**
- Đầu vào: SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY chỉ cấp cho ingest runner phía server.
- Đầu ra: get_http_client(*, dry_run: bool = False) -> httpx.Client | None; dry-run không cần Supabase write credential, còn ingest thật báo lỗi rõ nếu thiếu service key và chỉ cấu hình PostgREST authorization bằng key này.

- [ ] **Step 1: Viết kiểm thử credential của ingest trước**

  Thêm test_dry_run_needs_no_write_credential, test_live_ingest_requires_service_role_key, test_ingest_never_falls_back_to_anon_key, test_ingest_client_uses_service_key_only_in_headers và test_postgrest_writes_upsert_by_id vào backend/tests/test_supabase_vitaldb_ingest.py. Dùng httpx.Client giả; xác nhận credential không xuất hiện trong captured logs và mọi write dùng conflict key id của migration.

- [ ] **Step 2: Chạy tests và xác nhận fallback hiện tại làm chúng thất bại**

  Chạy: python -m pytest backend/tests/test_supabase_vitaldb_ingest.py -q
  Kết quả mong đợi: FAIL vì script hiện chia sẻ public/anon config để ghi bảng.

- [ ] **Step 3: Cập nhật get_http_client và main**

  Chỉ đọc SUPABASE_SERVICE_ROLE_KEY khi không phải dry-run; xóa fallback public key và write key hardcode. Truyền dry_run vào get_http_client, không tạo authenticated client trong dry-run và kiểm tra URL/key trước khi xử lý case cho ingest thật. Giữ on_conflict=id cùng merge-duplicate semantics cho cả bốn upsert. Không đưa credential vào exception string hoặc log.

- [ ] **Step 4: Chạy credential tests và kiểm tra cú pháp ingest**

  Chạy: python -m pytest backend/tests/test_supabase_vitaldb_ingest.py -q và python -m py_compile scripts/ingest_vitaldb_to_supabase.py
  Kết quả mong đợi: PASS; dry-run không cần database credential, ingest thật không thể dùng anon key để ghi.

- [ ] **Step 5: Commit thay đổi credential ingest**

      git add scripts/ingest_vitaldb_to_supabase.py backend/tests/test_supabase_vitaldb_ingest.py
      git commit -m "fix: use server credential for VitalDB ingestion"

### Task 3: Khóa schema parity giữa migration, ingest payload và frontend client

**Files:**
- Chỉ sửa nếu contract không khớp: src/lib/api/supabaseVitalDbClient.ts
- Chỉ sửa nếu contract không khớp: scripts/ingest_vitaldb_to_supabase.py
- Tạo: tests/supabase-vitaldb-contract.test.cjs
- Kiểm thử: backend/tests/test_supabase_vitaldb_ingest.py

**Interfaces:**
- Đầu vào: Migration ở Task 1, ingest đã tách credential ở Task 2 và các interface SupabaseCaseRow, SupabaseTrackRow, SupabaseEventRow, SupabaseSignalWindowRow hiện có.
- Đầu ra: Contract tests chứng minh table name cùng mọi field ingest/read đều có trong migration; signal window giữ overlap query window_start_s <= end AND window_end_s >= start; client chỉ đọc bằng public anon access.

- [ ] **Step 1: Viết migration/client/ingest parity tests đang thất bại**

  Thêm migration_defines_every_client_table_and_field, signal_window_query_uses_overlap_bounds và client_does_not_use_write_credential vào tests/supabase-vitaldb-contract.test.cjs. Dùng TypeScript AST parser đã có trong test suite để đọc bốn row interfaces; so sánh SQL columns và bốn table name trong ingest script.

- [ ] **Step 2: Chạy Node contract test và xác nhận thất bại**

  Chạy: node --test tests/supabase-vitaldb-contract.test.cjs
  Kết quả mong đợi: FAIL nếu migration thiếu field, interface/payload lệch hoặc client import service-role key.

- [ ] **Step 3: Chỉ sửa các field thực sự lệch**

  Chỉ cập nhật SQL type/nullability hoặc TypeScript/payload field nếu test phát hiện mismatch thật. Giữ observations, waveforms, predictions_uc04, predictions_uc05 và event value tương thích JSON. Không đổi public client read thành write hoặc thay đổi hành vi VitalDB query không liên quan.

- [ ] **Step 4: Chạy parity và local database tests**

  Chạy: node --test tests/supabase-vitaldb-contract.test.cjs, python -m pytest backend/tests/test_supabase_vitaldb_ingest.py -q và supabase test db supabase/tests/database/safeanes_vitaldb.test.sql
  Kết quả mong đợi: PASS; migration, PostgREST client và ingest payload cùng contract.

- [ ] **Step 5: Commit contract tests và mọi sửa parity cần thiết**

      git add tests/supabase-vitaldb-contract.test.cjs src/lib/api/supabaseVitalDbClient.ts scripts/ingest_vitaldb_to_supabase.py supabase/migrations/20261017000000_safeanes_vitaldb_contract.sql
      git commit -m "test: pin VitalDB Supabase data contract"

### Task 4: Thêm database CI và chuẩn bị staging handoff an toàn

**Files:**
- Tạo: .github/workflows/supabase-db.yml
- Tạo: docs/operations/VITALDB_INGEST.md
- Kiểm thử: backend/tests/test_supabase_vitaldb_ingest.py

**Interfaces:**
- Đầu vào: Tasks 1–3 và schema snapshot production đã đọc ở Task 1.
- Đầu ra: CI tái tạo local schema rồi chạy pgTAP, cùng hướng dẫn operator cấu hình write credential trong runner phía server và kiểm thử staging mà không lộ credential ra browser.

- [ ] **Step 1: Viết workflow contract test**

  Thêm test_supabase_ci_resets_and_tests_local_only vào backend/tests/test_supabase_vitaldb_ingest.py. Xác nhận CI cài Supabase CLI, chạy supabase start, local supabase db reset, supabase test db và supabase db lint --level error; không chứa --linked, remote DB URL hoặc production credential.

- [ ] **Step 2: Chạy test và xác nhận hiện tại thất bại**

  Chạy: python -m pytest backend/tests/test_supabase_vitaldb_ingest.py::test_supabase_ci_resets_and_tests_local_only -q
  Kết quả mong đợi: FAIL vì repo chưa có Supabase CI workflow được commit.

- [ ] **Step 3: Thêm CI workflow và hướng dẫn ingest**

  Tạo .github/workflows/supabase-db.yml chạy khi có pull request và push tới main; cố định Supabase CLI setup qua supabase/setup-cli@v1, start stack local, reset database local, chạy pgTAP và database lint. Tài liệu phải ghi bốn bảng, tên biến môi trường bắt buộc, local --dry-run, cách cấu hình secret chỉ phía server, lỗi dự kiến khi thiếu key và staging preflight. Không ghi giá trị credential vào tài liệu.

- [ ] **Step 4: Chạy toàn bộ database và credential checks local**

  Chạy: supabase start, supabase db reset, supabase test db, supabase db lint --level error, python -m pytest backend/tests/test_supabase_vitaldb_ingest.py -q và node --test tests/supabase-vitaldb-contract.test.cjs
  Kết quả mong đợi: PASS; các CI command chỉ thao tác local và không thay đổi project đã liên kết.

- [ ] **Step 5: Chuẩn bị staging decision record nhưng không chạy remote migration**

  So sánh production schema snapshot chỉ đọc với local migration. Ghi lại conflict, delta table/policy cuối cùng, phương án rollback migration và vị trí cần đặt credential cho staging runner. Dừng trước supabase db push, remote SQL hoặc ingest cho đến khi rollout được ủy quyền riêng.

- [ ] **Step 6: Commit CI và tài liệu operator**

      git add .github/workflows/supabase-db.yml docs/operations/VITALDB_INGEST.md backend/tests/test_supabase_vitaldb_ingest.py
      git commit -m "ci: test Supabase schema and RLS locally"

## Tài liệu Supabase tham khảo

- [Quy trình phát triển local](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Tài liệu CLI supabase test db](https://supabase.com/docs/reference/cli/supabase-test-db)
- [Kiểm thử database và RLS của Supabase](https://supabase.com/docs/guides/local-development/testing/overview)
