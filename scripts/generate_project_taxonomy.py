import os
import json
from pathlib import Path

def generate_taxonomy():
    taxonomy_path = Path("PROJECT_TAXONOMY.md")
    
    content = """# BẢN ĐỒ PHÂN LOẠI CẤU TRÚC DỰ ÁN SAFEANES (PROJECT TAXONOMY)

> **Dự án**: SafeAnes — High-Density Clinical Anesthesia Workstation & Real-Time Decision Support  
> **Kiến trúc**: Multi-Cloud Hybrid (Frontend: Next.js 16 trên Vercel | Backend: FastAPI & PyTorch trên Render Docker | Database: Supabase PostgreSQL | Storage: AWS S3)  
> **Bộ dữ liệu chuẩn**: VitalDB Clinical Dataset (v1.0.1) & Mô hình AI đa phương thức (UC-01 -> UC-05)  
> **Thời điểm cập nhật**: Tháng 10/2026  

---

## 1. TỔNG QUAN HỆ THỐNG & SƠ ĐỒ PHÂN LỚP (ARCHITECTURAL TIERS)

Hệ thống SafeAnes được tổ chức thành 7 phân tầng chức năng chính:

```mermaid
flowchart TD
    subgraph PRESENTATION["1. Phân tầng Trạm làm việc & Giao diện Lâm sàng (Frontend)"]
        UI_SHELL["Shell & Layout (GlobalClinicalHeader, WorkstationNav)"]
        UC01_M["UC-01 Device Aggregation (Tập hợp thiết bị)"]
        UC02_M["UC-02 Automated Record (Bệnh án gây mê)"]
        UC03_M["UC-03 Medication Safety (An toàn dùng thuốc)"]
        UC04_M["UC-04 Hemodynamics & Hypotension (Huyết động & Tụt HA)"]
        UC05_M["UC-05 Respiratory & Hypoxemia (Hô hấp & Thiếu oxy)"]
        REPLAY_UI["Simulation & VitalDB Replay Popover"]
    end

    subgraph CLIENT_ENGINE["2. Phân tầng Engine Mô phỏng & Replay Đồng bộ"]
        SIM_CORE["Simulation Engine (Clock, Ticker, State)"]
        SIM_ADAPTER["Adapters (Device, Monitors, Infusion Pumps)"]
        VITALDB_CTX["UC04VitalDbContext (Dual-Mode State Machine)"]
    end

    subgraph BACKEND_CORE["3. Phân tầng Dịch vụ Trí tuệ Lâm sàng & API (Backend)"]
        FASTAPI["FastAPI App (FastAPI 0.110+)"]
        API_ROUTES["Routes (/cases, /replay, /signals, /models, /health)"]
        REPLAY_SVC["ReplayStreamService (SSE Event Stream)"]
        VIEW_SVC["UC04 & UC05 VitalDB View Services"]
    end

    subgraph ML_CORE["4. Phân tầng Trí tuệ Nhân tạo & Dự báo Lâm sàng (ML Core)"]
        REGISTRY["Model Registry & Contracts"]
        PREPROCESS["Signal Cleaners & Waveform Windowing"]
        UC04_MODEL["UC-04 Transformer/TCN Checkpoint (model.pt)"]
        UC05_MODEL["UC-05 RespFormer Multimodal Checkpoint (respformer.pt)"]
    end

    subgraph DATA_PERSISTENCE["5. Phân tầng Lưu trữ & Đồng bộ Dữ liệu (Data Layer)"]
        VITALDB_STORE["VitalDB Local Cache & Manifests (.vital / .json)"]
        SUPABASE_DB["Supabase PostgreSQL (Cases, Tracks, Events, Windows)"]
        AWS_S3["AWS S3 Bucket (Model Weights & Long-term Artifacts)"]
    end

    subgraph QA_TESTING["6. Phân tầng Đảm bảo Chất lượng & Kiểm thử (QA & Verification)"]
        NODE_TESTS["Node.js Native Test Runner (173 Contract Tests)"]
        PYTEST_SUITE["Pytest Suite (153 ML & API Tests)"]
        PLAYWRIGHT["Playwright E2E & Chrome DevTools MCP"]
    end

    subgraph INFRASTRUCTURE["7. Phân tầng Vận hành & Triển khai Đa đám mây (DevOps)"]
        VERCEL_DEPLOY["Vercel Edge Deployment (safeanes.vercel.app)"]
        RENDER_CONTAINER["Render Docker Web Service (safeanes-backend-kfjc)"]
        DOCKERFILE["Multi-stage Dockerfile (PyTorch CPU Wheels)"]
    end

    PRESENTATION --> CLIENT_ENGINE
    CLIENT_ENGINE --> BACKEND_CORE
    BACKEND_CORE --> ML_CORE
    BACKEND_CORE --> DATA_PERSISTENCE
    QA_TESTING -.-> PRESENTATION
    QA_TESTING -.-> BACKEND_CORE
    INFRASTRUCTURE -.-> PRESENTATION
    INFRASTRUCTURE -.-> BACKEND_CORE
```

---

## 2. PHÂN LOẠI CHI TIẾT THEO DANH MỤC THƯ MỤC & TỆP TIN (DETAILED TAXONOMY)

### A. Phân tầng Giao diện & Trạm làm việc Lâm sàng (`src/`)

Thư mục `src/` chứa toàn bộ mã nguồn trạm làm việc gây mê viết bằng Next.js 16 (App Router), React 19, TypeScript và Tailwind CSS.

| Thư mục / Tệp tin | Vai trò / Mục đích chức năng | Use Case liên quan |
| :--- | :--- | :--- |
| `src/app/layout.tsx` | Layout gốc của ứng dụng (Client Provider, Theme, i18n font setup) | Toàn hệ thống |
| `src/app/page.tsx` | Trang chủ điều hướng / chuyển tiếp vào trạm làm việc ca phẫu thuật | Toàn hệ thống |
| `src/app/not-found.tsx` | Xử lý lỗi 404 chuẩn y tế | Toàn hệ thống |
| `src/app/api/backend/[...path]/route.ts` | Proxy trung gian Next.js chuyển tiếp API an toàn tới Render Backend & Supabase | Tích hợp đám mây |
| `src/app/safeanes/case/[caseId]/layout.tsx` | Khung trạm làm việc chuẩn phòng mổ (Header, Status Bar, Quick Jumps) | Toàn hệ thống |
| `src/app/safeanes/case/[caseId]/page.tsx` | Màn hình Tổng quan ca bệnh (Case Overview Dashboard) | Toàn hệ thống |
| `src/app/safeanes/case/[caseId]/situation/page.tsx` | **UC-01**: Giám sát thiết bị tập trung & Tình huống lâm sàng | **UC-01** |
| `src/app/safeanes/case/[caseId]/record/page.tsx` | **UC-02**: Bệnh án gây mê điện tử tự động hóa (AIMS Record) | **UC-02** |
| `src/app/safeanes/case/[caseId]/medications/page.tsx` | **UC-03**: Quản lý an toàn sử dụng thuốc & Cảnh báo tương tác | **UC-03** |
| `src/app/safeanes/case/[caseId]/hemodynamics/page.tsx` | **UC-04**: Theo dõi huyết động chuyên sâu & Dự báo tụt huyết áp | **UC-04** |
| `src/app/safeanes/case/[caseId]/respiratory/page.tsx` | **UC-05**: Theo dõi hô hấp chuyên sâu & Dự báo thiếu oxy máu | **UC-05** |
| `src/app/safeanes/case/[caseId]/data-integrity/page.tsx` | Trung tâm kiểm định tính toàn vẹn dữ liệu và độ trễ thiết bị | Quản trị chất lượng |
| `src/app/safeanes/case/[caseId]/replay/page.tsx` | Giao diện toàn màn hình cho chế độ phát lại hồi cứu VitalDB | Replay |

#### Components theo Phân hệ Lâm sàng (`src/components/modules/`)

- **`src/components/modules/uc01/` (Tập hợp dữ liệu thiết bị)**:
  - `UC01Workspace.tsx`: Trọng tâm khu vực làm việc UC-01.
  - `DeviceStatusStrip.tsx`: Thanh trạng thái kết nối máy mê, monitor, bơm tiêm.
  - `VitalSignGrid.tsx`, `VitalSignCard.tsx`: Lưới hiển thị chỉ số sinh tồn theo thời gian thực.
  - `DeviceLatencyBanner.tsx`: Cảnh báo mất kết nối hoặc lệch xung nhịp thiết bị.
  - `SignalQualityBadge.tsx`: Nhãn phân định chất lượng tín hiệu (EXCELLENT, DEGRADED, ARTIFACT).
  - `TechnicalEventAuditList.tsx`: Nhật ký sự kiện kỹ thuật của thiết bị phần cứng.

- **`src/components/modules/uc02/` (Bệnh án gây mê tự động)**:
  - `UC02Workspace.tsx`: Trọng tâm giao diện bệnh án gây mê điện tử.
  - `ClinicalTimeline.tsx`: Dòng thời gian phẫu thuật & gây mê tương tác trực quan.
  - `StructuredRecord.tsx`: Bệnh án cấu trúc hóa (giai đoạn tiền phẫu, khởi mê, duy trì, thoát mê).
  - `PatientBanner.tsx`: Thông tin hành chính, ASA, BMI, tiền sử dị ứng bệnh nhân.
  - `ReviewRail/`: Thanh thẩm định lâm sàng (`ReviewRailContainer.tsx`, `EventReviewCard.tsx`, `AuditTrailModal.tsx`).

- **`src/components/modules/uc03/` (An toàn dùng thuốc)**:
  - `MedicationSafetyWorkspace.tsx`: Khu vực quản lý y lệnh và an toàn truyền dịch.
  - `ActiveInfusionTracker.tsx`: Giám sát tốc độ truyền và nồng độ đích (TCI).
  - `InteractionAlertModal.tsx`: Hộp thoại chặn y lệnh khi phát hiện tương tác nguy hiểm.
  - `DrugBolusActionPanel.tsx`: Giao diện ra y lệnh tiêm tĩnh mạch nhanh an toàn.
  - `AllergySafetyCheck.tsx`: Kiểm tra chéo tiền sử quá mẫn của bệnh nhân.

- **`src/components/modules/uc04/` (Huyết động & Dự báo tụt HA)**:
  - `UC04Workspace.tsx`: Trạm phân tích huyết động học mật độ cao.
  - `HypotensionRiskCard.tsx`: Thẻ hiển thị nguy cơ tụt huyết áp đa khoảng thời gian (1, 3, 5 phút).
  - `VitalDbHemodynamicTrendPanel.tsx`: Đồ thị xu hướng MAP, SBP, DBP, HR, CI, SV, SVV, SVR.
  - `PredictedHpiPanel.tsx`: Bảng điểm chỉ số tiên lượng tụt HA (Hypotension Prediction Index).
  - `OverviewGaugeStrip.tsx`: Dải đồng hồ đo động học áp lực và cung lượng tim.
  - `visualization/`: Vẽ đồ thị tương tác (`HemodynamicTrendChart.tsx`, `MultiHorizonRiskPlot.tsx`).

- **`src/components/modules/uc05/` (Hô hấp & Dự báo thiếu oxy)**:
  - `UC05Workspace.tsx`: Trạm phân tích thông khí và cơ học phổi.
  - `RespiratoryWaveformCanvas.tsx`: Vẽ sóng áp lực đường thở (Paw), Capnogram (EtCO2), và Plethysmogram (SpO2).
  - `HypoxemiaRiskBanner.tsx`: Cảnh báo nguy cơ tụt độ bão hòa oxy máu ($SpO_2 < 90\%$).
  - `ClinicalSummaryRail.tsx`: Tổng kết chỉ số cơ học phổi ($V_T$, PEEP, Pplat, Compliance).
  - `WaveformCalibrationBadge.tsx`: Kiểm tra tính hợp lệ và chuẩn hóa dạng sóng đầu vào.

- **`src/components/shell/` (Bộ khung điều hành)**:
  - `GlobalClinicalHeader.tsx`: Thanh tiêu đề lâm sàng cố định trên cùng (thông tin ca mổ, pin, mạng).
  - `WorkstationNav.tsx`: Thanh điều hướng các phân hệ lâm sàng UC-01 -> UC-05.
  - `ClinicalAlertCenter.tsx`: Trung tâm tổng hợp và phân loại độ ưu tiên của mọi cảnh báo.

- **`src/components/simulation/` (Mô phỏng & Replay)**:
  - `SimulationControlPopover.tsx`: Hộp thoại điều khiển phát lại, chọn tốc độ (1x-60x), chọn nguồn dữ liệu (Mô phỏng tổng hợp hoặc VitalDB Replay), hiển thị chi tiết ca bệnh (Case 49, 210,...).
  - `ReplayProgressBar.tsx`: Thanh trượt thời gian ca mổ độ chính xác mili-giây.

#### Quản lý Trạng thái & Client Utilities (`src/context/` & `src/lib/`)

- **`src/context/`**:
  - `UC04VitalDbContext.tsx`: State machine trọng yếu quản lý chọn ca VitalDB, kết nối EventSource SSE stream, nạp chi tiết ca bệnh từ backend và kích hoạt fallback Supabase.
  - `SimulationReplayContext.tsx`: Engine đồng hồ mô phỏng client-side.
  - `HemodynamicContext.tsx`: Chia sẻ dữ liệu huyết động giữa các component.
  - `RespiratoryContext.tsx`: Quản lý bộ đệm dạng sóng và thông số hô hấp.
- **`src/lib/`**:
  - `api/safeAnesClient.ts`: SDK client TypeScript giao tiếp đầy đủ với Backend API (cases, models, replay, signals).
  - `api/supabaseClient.ts`: Client kết nối Supabase PostgreSQL phục vụ đọc danh mục ca bệnh trực tiếp khi backend khởi động nguội.
  - `modelOutputStatus.ts`: Chuẩn hóa trạng thái mô hình (`INPUT_READY_MODEL_INTEGRATION_READY`, `CACHE_NOT_READY`,...).
  - `waveformProcessing.ts`: Tiền xử lý, lọc nhiễu và làm mượt dạng sóng trước khi render Canvas.

---

### B. Phân tầng Trí tuệ Lâm sàng & API Backend (`backend/`)

Thư mục `backend/` chứa mã nguồn dịch vụ backend xây dựng trên nền tảng Python 3.12, FastAPI, PyTorch và thư viện VitalDB.

#### 1. Core & Cấu hình (`backend/app/core/`)
- `config.py`: Đọc biến môi trường (`Settings`), cấu hình đường dẫn dữ liệu, model registry, Redis/Memory cache entries, giới hạn mẫu sóng.
- `errors.py`: Định nghĩa ngoại lệ hệ thống chuẩn (`ApiServiceError`) gồm `CASE_NOT_FOUND`, `TRACK_NOT_AVAILABLE`, `MODEL_NOT_READY`, `CACHE_NOT_READY`, `INSUFFICIENT_DATA`.
- `runtime.py`: Khởi tạo và liên kết các Repository, Service, ModelManager vào vòng đời ứng dụng FastAPI (`app.state.runtime`).

#### 2. Định tuyến API (`backend/app/api/routes/`)
- `cases.py`: Danh sách ca bệnh (`/cases`), chi tiết ca (`/cases/{case_id}`), danh sách track (`/cases/{case_id}/tracks`).
- `replay.py`: Quản lý phiên phát lại (`POST /replay/sessions`, play, pause, resume, reset, seek, set_speed) và endpoint Server-Sent Events (`GET /replay/sessions/{session_id}/stream`).
- `signals.py`: Đọc tín hiệu số và dạng sóng theo khoảng thời gian (`/signals/numeric`, `/signals/waveform`).
- `models.py`: Truy vấn trạng thái sẵn sàng của mô hình AI (`/models`, `/models/{model_id}`).
- `health.py`: Kiểm tra sức khỏe dịch vụ Kubernetes/Docker (`/health/live`, `/health/ready`).

#### 3. Tầng Dịch vụ & Truy cập Dữ liệu (`backend/app/services/` & `repositories/`)
- `case_repository.py`: Đọc danh mục ca bệnh (`vitaldb_case_catalog.json`), manifest chi tiết, kiểm tra băm SHA-256 và tải bổ sung file raw (`ensure_raw_cached`).
- `vitaldb_repository.py`: Mở file `.vital` qua thư viện `vitaldb.VitalFile`, đọc mảng số và sóng nhị phân, bộ nhớ đệm LRU đa mức.
- `services/replay/stream.py` (`ReplayStreamService`): Đóng gói snapshot và delta tín hiệu theo con trỏ thời gian để truyền qua SSE stream.
- `services/signals/uc04_view.py`: Dịch vụ chuẩn bị dữ liệu đầu vào cho mô hình dự báo tụt HA UC-04.
- `services/signals/uc05_view.py`: Dịch vụ chuẩn bị dữ liệu đầu vào cho mô hình dự báo suy hô hấp UC-05.

#### 4. Khung Máy học & Mô hình AI (`backend/app/ml/`)
- `registry/`: Quản lý đăng ký mô hình (`model_registry.py`), metadata (`model_registry.json`).
- `contracts/`: Hợp đồng giao diện mô hình (`window.py`, `inference_window.py`).
- `models/uc04/architecture.py`: Kiến trúc mạng nơ-ron Transformer / TCN dự báo tụt huyết áp.
- `models/uc05/architecture.py`: Kiến trúc RespFormer đa phương thức dự báo thiếu oxy máu.
- `preprocessing/`: Chuẩn hóa dữ liệu tín hiệu:
  - `uc04.py`: Làm sạch chuỗi thời gian ART_MBP, HR, nội suy khoảng trống.
  - `uc05.py`: Tiền xử lý sóng Capnogram, Airway Pressure, PPG và hàm `_clean_spo2_for_quality`.
  - `vitaldb_loader.py`: Cắt lát cửa sổ trượt (sliding window) từ file `.vital`.
- `inference/`:
  - `uc04.py`: Dịch vụ nạp trọng số checkpoint PyTorch và chạy suy luận dự báo tụt HA.
  - `uc05.py`: Dịch vụ nạp RespFormer và tính toán xác suất thiếu oxy máu.

#### 5. Xử lý & Quản lý Dữ liệu VitalDB (`backend/app/vitaldb/`)
- `pipeline.py`: Pipeline quét và tuyển chọn ca bệnh từ 6,388 ca VitalDB theo tiêu chí lâm sàng.
- `eligibility.py`: Đánh giá ca bệnh có đủ điều kiện phục vụ UC-04 và UC-05 hay không.
- `storage.py`: Lưu trữ bất biến các file nhị phân `.vital` và manifest JSON.

---

### C. Phân tầng Trọng số Mô hình Checkpoint (`models/`)

Nơi lưu trữ các checkpoint PyTorch đã được huấn luyện, hiệu chuẩn và xác minh lâm sàng:

| Thư mục | Tệp tin | Mô tả chức năng |
| :--- | :--- | :--- |
| `models/safeanes_uc04_model/` | `model.pt` | Checkpoint PyTorch mạng Transformer dự đoán tụt huyết áp (MAP $\le 65$ mmHg kéo dài $\ge 60$s) tại các mốc 1, 3, 5 phút |
| | `architecture.py` | Định nghĩa kiến trúc lớp mạng PyTorch |
| | `metadata.json` | Siêu dữ liệu mô hình: phiên bản, cấu hình tham số, ngưỡng phân loại |
| `models/safeanes_uc05_respformer_v1/` | `respformer.pt` | Checkpoint PyTorch mô hình RespFormer tiếp nhận 3 dạng sóng (Paw, Capno, Pleth) dự đoán đợt giảm $SpO_2 < 90\%$ |
| | `architecture.py` | Định nghĩa kiến trúc Transformer đa phương thức |
| | `config.json` | Cấu hình chiều sâu transformer, số head attention |
| | `model_description.md` | Tài liệu giải thích khoa học và độ đo kiểm thử lâm sàng |

---

### D. Phân tầng Cơ sở dữ liệu & Di chuyển (`supabase/`)

Chứa mã định nghĩa cấu trúc cơ sở dữ liệu quan hệ PostgreSQL trên nền tảng Supabase:

| Thư mục / Tệp tin | Mục đích & Lược đồ bảng (Table Schema) |
| :--- | :--- |
| `supabase/migrations/20261011_safeanes_core_tables.sql` | Migration tạo 4 bảng chính: <br>• `safeanes_cases`: Danh mục ca mổ, thông tin bệnh nhân (tuổi, giới, ASA, BMI), thời lượng ca. <br>• `safeanes_tracks`: Danh mục các kênh tín hiệu có trong từng ca (tần số lấy mẫu, đơn vị). <br>• `safeanes_events`: Sự kiện ghi nhận trong mổ (khởi mê, rạch da, đặt nội khí quản, rút ống). <br>• `safeanes_signal_windows`: Các cửa sổ tín hiệu đã tiền xử lý phục vụ huấn luyện và kiểm định mô hình. |

---

### E. Phân tầng Kịch bản Tự động hóa & DevOps (`scripts/` & `backend/scripts/`)

| Tệp tin | Mục đích chức năng |
| :--- | :--- |
| `scripts/ingest_vitaldb_to_supabase.py` | Kịch bản tự động đọc file manifest VitalDB và nạp dữ liệu đồng bộ vào Supabase PostgreSQL |
| `scripts/copy-standalone-assets.cjs` | Kịch bản postbuild copy static assets cho Next.js standalone runner |
| `scripts/figma/` | Bộ công cụ đồng bộ thiết kế từ Figma vào Design System của dự án SafeAnes |
| `backend/scripts/integrate_case_49.py` | Kịch bản chuyên dụng tải, phân tích, tạo manifest và tích hợp Case 49 (Cắt thùy phổi - 12 đợt suy hô hấp) |
| `backend/scripts/test_render_models.py` | Kịch bản kiểm thử tải trọng số mô hình PyTorch trong môi trường container Render |

---

### F. Phân tầng Kiểm thử Đảm bảo Chất lượng (`tests/` & `backend/tests/`)

Hệ thống kiểm thử kép độc lập đảm bảo độ tin cậy y tế:

1. **Frontend & Contract Tests (`tests/*.test.cjs`)**: 173 tests chạy với native Node.js Test Runner:
   - `model-output-format.test.cjs`: Kiểm thử chuẩn hóa định dạng hiển thị đầu ra mô hình AI.
   - `simulation-engine.test.cjs`: Kiểm thử đồng hồ mô phỏng, độ trễ và tính toán bước nhảy thời gian.
   - `vitaldb-case-selection.test.cjs`: Kiểm thử bộ máy chọn ca và duy trì trạng thái Replay.
   - `uc01-device-aggregation.test.cjs`: Kiểm định hợp đồng tập hợp tín hiệu từ nhiều thiết bị.
   - `uc02-record.test.cjs`: Kiểm định tự động sinh biên bản gây mê.
   - `uc03-medication-safety.test.cjs`: Kiểm định quy tắc chặn và cảnh báo tương tác thuốc.
   - `uc04-hemodynamics.test.cjs`: Kiểm định đầu ra dự báo tụt huyết áp đa khoảng thời gian.
   - `uc05-respiratory.test.cjs`: Kiểm định dự báo giảm oxy máu và nhận dạng mất thông khí.
   - `locale-strings.test.cjs`: Kiểm định tính đầy đủ của bộ dịch đa ngôn ngữ (Tiếng Việt & Tiếng Anh).

2. **Backend & Machine Learning Tests (`backend/tests/test_*.py`)**: 153 tests chạy với Pytest:
   - `test_api_backend.py`: Kiểm thử toàn bộ endpoint REST API và xử lý mã lỗi HTTP.
   - `test_uc04_inference.py`: Kiểm thử độ chính xác suy luận mô hình tụt HA.
   - `test_uc05_inference.py`: Kiểm thử suy luận mô hình RespFormer trên 3 dạng sóng.
   - `test_vitaldb_pipeline.py`: Kiểm thử pipeline làm sạch dữ liệu, lọc chuỗi thời gian Solar8000.
   - `test_vitaldb_storage.py`: Kiểm thử lưu trữ bất biến và xác minh băm SHA-256.

---

### G. Phân tầng Tài liệu Kiến trúc & Lâm sàng (`docs/`)

- `docs/integration/SAFEANES_BACKEND_API.md`: Đặc tả kỹ thuật chi tiết toàn bộ REST & SSE API.
- `docs/integration/NEXTJS_API_PROXY.md`: Hướng dẫn cấu hình proxy Next.js chuyển tiếp đám mây.
- `docs/design/`: Bản thiết kế giao diện, chứng cứ xác thực UX phòng mổ, tokens thiết kế.
- `docs/superpowers/plans/`: Bản kế hoạch kỹ thuật các tính năng mở rộng.

---

## 3. BẢNG TRA CỨU ÁNH XẠ USE CASE (USE CASE MAPPING TABLE)

| Mã Use Case | Tên nghiệp vụ lâm sàng | Các tệp Frontend cốt lõi | Các tệp Backend / ML cốt lõi | Bộ dữ liệu & Mô hình |
| :--- | :--- | :--- | :--- | :--- |
| **UC-01** | Tập hợp dữ liệu thiết bị y tế (Device Data Aggregation) | `src/app/safeanes/case/[caseId]/situation/`<br>`src/components/modules/uc01/` | `backend/app/repositories/vitaldb_repository.py`<br>`backend/app/services/replay/stream.py` | 70+ track VitalDB (Primus, Solar8000, BIS, SNUADC, Orchestra) |
| **UC-02** | Bệnh án gây mê điện tử tự động (Automated Anesthesia Record) | `src/app/safeanes/case/[caseId]/record/`<br>`src/components/modules/uc02/` | `backend/app/api/routes/cases.py`<br>`supabase/migrations/20261011_safeanes_core_tables.sql` | Bảng `safeanes_events`, AIMS Clinical Timeline |
| **UC-03** | An toàn dùng thuốc & Cảnh báo tương tác (Medication Safety) | `src/app/safeanes/case/[caseId]/medications/`<br>`src/components/modules/uc03/` | `src/simulation/engines/medicationEngine.ts`<br>`backend/app/services/replay/stream.py` | TCI Propofol / Remifentanil, Drug-drug interaction rules |
| **UC-04** | Theo dõi huyết động & Dự báo tụt HA (Hypotension Prediction) | `src/app/safeanes/case/[caseId]/hemodynamics/`<br>`src/components/modules/uc04/` | `backend/app/ml/models/uc04/`<br>`backend/app/ml/inference/uc04.py`<br>`backend/app/services/signals/uc04_view.py` | `models/safeanes_uc04_model/model.pt`<br>Dự báo tụt MAP $\le 65$ mmHg |
| **UC-05** | Giám sát hô hấp & Dự báo thiếu oxy máu (Hypoxemia Prediction) | `src/app/safeanes/case/[caseId]/respiratory/`<br>`src/components/modules/uc05/` | `backend/app/ml/models/uc05/`<br>`backend/app/ml/inference/uc05.py`<br>`backend/app/services/signals/uc05_view.py` | `models/safeanes_uc05_respformer_v1/respformer.pt`<br>Dự báo $SpO_2 < 90\%$ $\ge 60$s (Case 49) |

---

## 4. TỆP TIN CẤU HÌNH GỐC (ROOT CONFIGURATION FILES)

| Tệp tin | Vai trò cấu hình |
| :--- | :--- |
| `package.json` | Định nghĩa dependencies frontend (Next.js 16, React 19, Lucide, Tailwind) và scripts |
| `tsconfig.json` | Cấu hình trình biên dịch TypeScript (strict mode, path alias `@/*`) |
| `next.config.js` | Cấu hình Next.js (output standalone, domain rewrites, headers an toàn y tế) |
| `tailwind.config.ts` | Design token y tế (bảng màu chuyên dụng phòng mổ: safe-cyan, safe-green, safe-red,...) |
| `render.yaml` | Bản kê hạ tầng đám mây tự động triển khai Docker Web Service trên Render |
| `backend/Dockerfile` | Dockerfile đa tầng đóng gói FastAPI, PyTorch CPU, và toàn bộ 8 file raw `.vital` |
| `backend/requirements-api.txt` | Danh mục thư viện Python API (fastapi, uvicorn, pydantic, vitaldb) |
| `backend/requirements-ml.txt` | Danh mục thư viện Python ML (torch cpu, numpy, scipy) |
| `AGENTS.md` | Bản quy chuẩn kỹ thuật và chỉ dẫn kiểm soát tác tử AI (GitNexus impact analysis, coding rules) |
"""

    taxonomy_path.write_text(content, encoding="utf-8")
    print(f"Taxonomy generated at: {taxonomy_path.resolve()} ({len(content)} bytes)")

if __name__ == "__main__":
    generate_taxonomy()
