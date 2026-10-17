"use client";

import React, { useMemo } from "react";
import { Activity, ClipboardList, Pill, Radio } from "lucide-react";
import { ClinicalPanel } from "@/components/common/ClinicalPanel";
import { ClinicalWaveformCanvas } from "@/components/clinical-waveforms";
import { useTranslation } from "@/context/LocalizationContext";
import { useSafeAnesData, type VitalDbRecordedSelection } from "@/context/UC04VitalDbContext";
import { projectUC05VitalDbView } from "@/adapters/uc05VitalDbAdapter";
import { toRespiratoryVitalDbCaseData } from "@/adapters/uc05VitalDbCaseAdapter";
import { mergeVitalDbEvents } from "@/adapters/vitalDbEventAdapter";

export type VitalDbReplayModule = "OVERVIEW" | "UC01" | "UC02" | "UC03";

interface VitalDBReplayWorkspaceProps {
  module: VitalDbReplayModule;
}

export function VitalDBReplayWorkspace({ module }: VitalDBReplayWorkspaceProps) {
  const { locale } = useTranslation();
  const replay = useSafeAnesData();
  const vi = locale === "vi";
  const isOverview = module === "OVERVIEW";
  const now = replay.session?.current_time_s ?? 0;
  const caseId = replay.selectedCaseId ?? "—";
  const viewSignals = useMemo(() => {
    const byTrack = new Map<string, Record<string, any>>();
    for (const series of [...(replay.view?.signals ?? []), ...(replay.uc05View?.signals ?? [])]) {
      byTrack.set(series.track_name, series);
    }
    return [...byTrack.values()].map((series) => {
      const observation = (series.observations ?? []).reduce((latest: any, item: any) =>
        item.timestamp <= now && (!latest || item.timestamp > latest.timestamp) ? item : latest, null);
      const metadata = replay.trackMetadata.find((row) => row.track_name === series.track_name);
      return { series, observation, metadata };
    }).sort((left, right) => String(left.series.signal ?? left.series.track_name)
      .localeCompare(String(right.series.signal ?? right.series.track_name)));
  }, [now, replay.trackMetadata, replay.uc05View?.signals, replay.view?.signals]);
  const waveformRows = useMemo(() => {
    const view = replay.uc05View;
    if (!view) return [];
    const projection = projectUC05VitalDbView(view, Math.min(view.as_of_s, now));
    const data = toRespiratoryVitalDbCaseData(
      projection,
      replay.session?.status ?? "PAUSED",
      replay.session?.speed ?? 1,
    );
    return [
      { label: vi ? "Capnogram" : "Capnogram", waveform: data.capnogramWaveform, quality: data.signalQuality.capnogram },
      { label: vi ? "Plethysmograph" : "Plethysmograph", waveform: data.plethWaveform, quality: data.signalQuality.pleth },
    ].filter((row): row is typeof row & { waveform: NonNullable<typeof row.waveform> } => row.waveform !== null);
  }, [now, replay.session?.speed, replay.session?.status, replay.uc05View, vi]);

  const events = useMemo(() => {
    return mergeVitalDbEvents(
      replay.view?.events ?? [],
      replay.uc05View?.recorded_events ?? [],
      replay.uc05View?.derived_events ?? [],
      now,
    );
  }, [now, replay.uc05View?.derived_events, replay.uc05View?.recorded_events, replay.view?.events]);

  const pumpTrackRows = useMemo(() => replay.medicationTracks.map((track) => {
    const observation = (track.observations ?? []).reduce((latest: any, item: any) =>
      item.timestamp <= now && (!latest || item.timestamp > latest.timestamp) ? item : latest, null);
    return { track, observation };
  }), [now, replay.medicationTracks]);

  const selectEvent = (event: (typeof events)[number]) => {
    const selection: VitalDbRecordedSelection = {
      id: String(event.id),
      timestamp: event.availableAt,
      source: String(event.source ?? "VitalDB EVENT"),
      kind: event.kind,
    };
    void replay.selectRecordedEvent(selection);
  };

  return (
      <div className="flex h-full min-h-[720px] min-w-[1180px] flex-col gap-2 overflow-visible bg-safe-bg p-2 text-safe-text">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-sm border border-safe-yellow/40 bg-safe-yellow/5 px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-safe-yellow">
            <Radio className="h-3.5 w-3.5" />
            {vi ? "CA VITALDB ĐÃ GHI" : "VITALDB RECORDED CASE"}
          </div>
          <p className="mt-0.5 text-[10px] text-safe-text-muted">
            {vi
              ? "Dữ liệu ghi nhận theo thời gian tương đối của ca; đây không phải màn hình theo dõi bệnh nhân trực tiếp."
              : "Recorded case-relative data; this is not a live patient monitor."}
          </p>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
          <span className="text-safe-text-muted">{vi ? "Ca" : "Case"}: </span>
          <span className="font-bold text-safe-cyan">{caseId}</span>
          <span className="mx-2 text-safe-border">·</span>
          <span className="text-safe-text">{formatCaseTime(now)}</span>
        </div>
      </div>

      {replay.error && (
        <div role="status" className="rounded-sm border border-safe-red/40 bg-safe-red/5 px-3 py-2 text-[11px] text-safe-red">
          {replay.error}
        </div>
      )}

      {module === "OVERVIEW" && (
        <ClinicalPanel
          title={vi ? "Inference trực tiếp và cache offline" : "Live inference and offline cache"}
          subtitle={vi
            ? "Inference trực tiếp có generation riêng; kết quả cache được giữ thành nguồn riêng."
            : "Live results are generation-scoped; cached predictions remain a separate source."}
          icon={Activity}
          status={<StatusBadge value={replay.liveInferenceErrors.length > 0
            ? "INFERENCE ERROR"
            : replay.liveInferenceResults.length > 0 ? "LIVE_INFERENCE" : "WAITING"} />}
          scrollBehavior="auto"
        >
          <div className="space-y-3 text-[10px]">
            {replay.liveInferenceResults.length === 0 && replay.liveInferenceErrors.length === 0 && (
              <p className="text-safe-text-muted">
                {vi
                  ? "Chưa có kết quả LIVE_INFERENCE cho generation replay hiện tại."
                  : "No LIVE_INFERENCE result is available for the current replay generation."}
              </p>
            )}
            {replay.liveInferenceResults.map((result) => (
              <div key={`${result.model_id}-${result.prediction_time}`} className="rounded-sm border border-safe-cyan/30 bg-safe-cyan/5 p-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold text-safe-cyan">LIVE_INFERENCE</span>
                  <span className="font-mono">{result.model_id}</span>
                  <span className="text-safe-text-muted">
                    {vi ? "Thời điểm" : "Prediction time"} {formatCaseTime(result.prediction_time)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {result.predictions.map((prediction, index) => {
                    const value = prediction.interpreted_output?.value ?? prediction.raw_output;
                    const horizon = prediction.horizon_minutes_or_null;
                    return (
                      <span key={`${result.model_id}-${result.prediction_time}-${index}`} className="rounded-sm border border-safe-border-subtle px-1.5 py-1">
                        {horizon == null ? (vi ? "Tổng thể" : "Overall") : `T+${horizon}m`}
                        {" · "}
                        {typeof value === "number" ? formatValue(value) : "—"}
                      </span>
                    );
                  })}
                  {result.predictions.length === 0 && (
                    <span className="text-safe-text-muted">{vi ? "Model không trả horizon." : "Model returned no horizons."}</span>
                  )}
                </div>
              </div>
            ))}
            {replay.liveInferenceErrors.map((item) => (
              <div key={`${item.model_id}-${item.prediction_time}-${item.code}`} role="status" className="rounded-sm border border-safe-red/40 bg-safe-red/5 p-2 text-safe-red">
                <span className="font-bold">{vi ? "Inference không khả dụng" : "Inference unavailable"}</span>
                {" · LIVE_INFERENCE · "}
                <span className="font-mono">{item.model_id} · {item.code}</span>
                {" · "}
                {formatCaseTime(item.prediction_time)}
              </div>
            ))}
            <div className="grid gap-2 border-t border-safe-border-subtle pt-2 md:grid-cols-2">
              <div>
                <div className="mb-1 font-bold text-safe-text-muted">OFFLINE_CACHE · UC04</div>
                {replay.uc04Predictions.slice(-3).map((item, index) => (
                  <div key={`uc04-${item.prediction_time}-${item.horizon_minutes_or_null}-${index}`} className="flex justify-between gap-2 border-b border-safe-border-subtle/60 py-1">
                    <span>{item.horizon_minutes_or_null == null ? "—" : `T+${item.horizon_minutes_or_null}m`}</span>
                    <span className="font-mono">{formatValue(item.interpreted_output.value)}</span>
                    <span className="text-safe-text-muted">{formatCaseTime(item.prediction_time)}</span>
                  </div>
                ))}
                {replay.uc04Predictions.length === 0 && (
                  <p className="text-safe-text-muted">{vi ? "Không có dự đoán cache." : "No cached predictions."}</p>
                )}
              </div>
              <div>
                <div className="mb-1 font-bold text-safe-text-muted">OFFLINE_CACHE · UC05</div>
                {replay.uc05Predictions.slice(-3).map((item, index) => (
                  <div key={`uc05-${item.prediction_time}-${item.horizon_minutes_or_null}-${index}`} className="flex justify-between gap-2 border-b border-safe-border-subtle/60 py-1">
                    <span>{item.horizon_minutes_or_null == null ? "—" : `T+${item.horizon_minutes_or_null}m`}</span>
                    <span className="font-mono">{formatValue(item.interpreted_output.value)}</span>
                    <span className="text-safe-text-muted">{formatCaseTime(item.prediction_time)}</span>
                  </div>
                ))}
                {replay.uc05Predictions.length === 0 && (
                  <p className="text-safe-text-muted">{vi ? "Không có dự đoán cache." : "No cached predictions."}</p>
                )}
              </div>
            </div>
          </div>
        </ClinicalPanel>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.35fr)_minmax(340px,0.8fr)] gap-2">
        {(module === "UC01" || isOverview) && (
          <>
            <ClinicalPanel
              title={isOverview
                ? (vi ? "Tín hiệu ca đã ghi" : "Recorded case signals")
                : (vi ? "Quan sát VitalDB gần nhất" : "Latest recorded observations")}
              subtitle={vi
                ? "Mẫu gốc khả dụng tại thời điểm replay hiện tại"
                : "Original samples available at the current replay cursor"}
              icon={Activity}
              status={<StatusBadge value={replay.session?.status ?? "STOPPED"} />}
              scrollBehavior="auto"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 bg-safe-surface text-[9px] uppercase tracking-wide text-safe-text-muted">
                    <tr>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Tín hiệu" : "Signal"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Giá trị" : "Value"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Thời điểm" : "Recorded time"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Nguồn" : "Source"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Chất lượng" : "Quality"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewSignals.map(({ series, observation, metadata }) => (
                      <tr key={series.track_name} className="border-b border-safe-border-subtle/70">
                        <td className="px-2 py-1.5 font-semibold">{series.signal ?? series.track_name}</td>
                        <td className="px-2 py-1.5 font-mono tabular-nums">
                          {observation?.is_missing || observation?.value == null
                            ? (vi ? "TÍN HIỆU KHÔNG KHẢ DỤNG" : "SIGNAL UNAVAILABLE")
                            : (
                              <>
                                {formatValue(observation.value)}
                                {(() => {
                                  const displayUnit = resolveClinicalDisplayUnit(series.signal ?? series.track_name, observation.unit || series.unit);
                                  return displayUnit ? <> <span className="text-safe-text-muted">{displayUnit}</span></> : null;
                                })()}
                              </>
                            )}
                        </td>
                        <td className="px-2 py-1.5 font-mono tabular-nums text-safe-text-muted">
                          {observation ? formatCaseTime(observation.timestamp) : "—"}
                        </td>
                        <td className="max-w-[260px] break-words px-2 py-1.5 text-safe-text-muted">
                          {metadata?.source_device ? `${metadata.source_device} · ` : ""}{series.source ?? "NOT_RECORDED"}
                        </td>
                        <td className="px-2 py-1.5"><StatusBadge value={observation?.quality ?? series.quality ?? "UNKNOWN"} /></td>
                      </tr>
                    ))}
                    {viewSignals.length === 0 && <EmptyRow columns={5} label={vi ? "Chưa có mẫu tại thời điểm này" : "No recorded samples available at this time"} />}
                  </tbody>
                </table>
              </div>
            </ClinicalPanel>
            {isOverview ? (
              <ClinicalPanel
                title={vi ? "Trạng thái replay" : "Replay status"}
                subtitle={vi ? "Cùng ca và đồng hồ đang dùng ở UC01–UC05" : "Shared case and cursor used by UC01–UC05"}
                icon={Radio}
                status={<StatusBadge value={replay.session?.status ?? "STOPPED"} />}
                scrollBehavior="auto"
              >
                <dl className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-2 text-[10px]">
                  <dt className="text-safe-text-muted">{vi ? "Ca VitalDB" : "VitalDB case"}</dt>
                  <dd className="font-mono font-bold text-safe-cyan">{caseId}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Thời điểm ca" : "Case-relative time"}</dt>
                  <dd className="font-mono tabular-nums">{formatCaseTime(now)}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Thời lượng ghi nhận" : "Recorded duration"}</dt>
                  <dd className="font-mono tabular-nums">{formatCaseTime(replay.session?.duration_seconds ?? 0)}</dd>
                  <dt className="text-safe-text-muted">UC04 {vi ? "trạng thái model" : "model status"}</dt>
                  <dd><StatusBadge value={replay.session?.uc04_model_status ?? "UNKNOWN"} /></dd>
                  <dt className="text-safe-text-muted">UC05 {vi ? "trạng thái model" : "model status"}</dt>
                  <dd><StatusBadge value={replay.session?.uc05_model_status ?? "UNKNOWN"} /></dd>
                  <dt className="text-safe-text-muted">{vi ? "Track đã ghi" : "Recorded tracks"}</dt>
                  <dd className="font-mono tabular-nums">{replay.availableTracks.length}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Sử dụng lâm sàng" : "Clinical use"}</dt>
                  <dd className="font-bold text-safe-yellow">{vi ? "KHÔNG" : "NO"}</dd>
                </dl>
              </ClinicalPanel>
            ) : (
              <ClinicalPanel
                title={vi ? "Tín hiệu và nguồn có sẵn" : "Available recorded tracks"}
                subtitle={vi ? "Siêu dữ liệu lấy từ danh mục VitalDB" : "Track metadata from the VitalDB case catalog"}
                icon={Radio}
                scrollBehavior="auto"
              >
                {waveformRows.length > 0 && (
                  <div className="mb-2 space-y-2">
                    {waveformRows.map(({ label, waveform, quality }) => (
                      <div key={waveform.signal} className="min-w-0 rounded-sm border border-safe-border-subtle bg-safe-bg p-1.5">
                        <div className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[9px]">
                          <span className="font-semibold text-safe-text">{label} · {waveform.unit}</span>
                          <span className="truncate text-safe-text-muted" title={waveform.sourceDevice}>{waveform.sourceDevice} · {quality.toUpperCase()}</span>
                        </div>
                        <div className="h-14 min-w-0">
                          <ClinicalWaveformCanvas
                            source={waveform}
                            color={waveform.modality === "CAPNOGRAM" ? "#F5E328" : "#00D9FF"}
                            accessibleLabel={`${label} ${caseId} ${formatCaseTime(now)}`}
                            waitingLabel={vi ? "Không có mẫu trong cửa sổ này" : "No samples in this window"}
                            showCursor
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <ul className="space-y-1 text-[10px]">
                  {replay.trackMetadata.map((track) => (
                    <li key={String(track.track_name)} className="grid grid-cols-[minmax(0,1fr)_max-content] gap-2 border-b border-safe-border-subtle/70 py-1">
                      <span className="min-w-0 break-all font-mono">{String(track.track_name)}</span>
                      <span className="text-right text-safe-text-muted">{String(track.track_type ?? "UNKNOWN")} · {resolveClinicalDisplayUnit(track.signal ?? track.track_name, track.unit) || String(track.unit ?? "NOT_RECORDED")}</span>
                    </li>
                  ))}
                  {replay.trackMetadata.length === 0 && <li className="py-2 text-safe-text-muted">{vi ? "Siêu dữ liệu chưa sẵn sàng." : "Track metadata is not available yet."}</li>}
                </ul>
              </ClinicalPanel>
            )}
          </>
        )}

        {module === "UC02" && (
          <>
            <ClinicalPanel
              title={vi ? "Sự kiện và bằng chứng đã ghi" : "Recorded events and evidence"}
              subtitle={vi ? "Sự kiện quan sát được hoặc dẫn xuất có thời điểm khả dụng" : "Observed annotations and derived events revealed when available"}
              icon={ClipboardList}
              status={<span className="rounded-sm border border-safe-yellow/40 px-1.5 py-0.5 text-[9px] font-bold text-safe-yellow">{vi ? "CHƯA KÝ" : "UNSIGNED"}</span>}
              scrollBehavior="auto"
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] border-collapse text-left text-[11px]">
                  <thead className="sticky top-0 bg-safe-surface text-[9px] uppercase tracking-wide text-safe-text-muted">
                    <tr>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Thời điểm" : "Time"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Loại" : "Class"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Sự kiện" : "Event"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Định nghĩa / nguồn" : "Definition / source"}</th>
                      <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Chất lượng" : "Quality"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...events].reverse().map((event) => (
                      <tr key={String(event.id)} className={`cursor-pointer border-b border-safe-border-subtle/70 hover:bg-safe-surface-secondary ${replay.selectedRecordedEvent?.id === String(event.id) ? "bg-safe-cyan/10" : ""}`}>
                        <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums">
                          <button type="button" onClick={() => selectEvent(event)} className="text-left text-safe-cyan hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-safe-cyan">
                            {formatCaseTime(Number(event.timestamp))}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-2 py-1.5"><StatusBadge value={event.kind} /></td>
                        <td className="max-w-[300px] break-words px-2 py-1.5">{event.description ?? event.event_type ?? "VitalDB event"}</td>
                        <td className="max-w-[320px] break-words px-2 py-1.5 text-safe-text-muted">{event.definition ?? event.source ?? "VitalDB source"}</td>
                        <td className="whitespace-nowrap px-2 py-1.5"><StatusBadge value={event.quality ?? "UNKNOWN"} /></td>
                      </tr>
                    ))}
                    {events.length === 0 && <EmptyRow columns={5} label={vi ? "Chưa có sự kiện khả dụng trước thời điểm replay này." : "No events are available at this replay time."} />}
                  </tbody>
                </table>
              </div>
            </ClinicalPanel>
            <ClinicalPanel
              title={vi ? "Trạng thái bằng chứng" : "Evidence status"}
              subtitle={vi ? "Không tự động xác nhận quan hệ nhân quả hoặc ký hồ sơ." : "Temporal association does not establish causality; no automatic signing."}
              icon={ClipboardList}
              scrollBehavior="auto"
            >
              <dl className="mb-3 grid grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1 rounded-sm border border-safe-border-subtle bg-safe-bg p-2 text-[10px]">
                <dt className="text-safe-text-muted">{vi ? "Hồ sơ dùng thuốc xác thực" : "Authoritative medication documentation"}</dt>
                <dd className="font-mono font-bold text-safe-yellow">NOT_RECORDED</dd>
                <dt className="text-safe-text-muted">{vi ? "Hồ sơ thủ thuật" : "Procedure documentation"}</dt>
                <dd className="font-mono font-bold text-safe-yellow">NOT_RECORDED</dd>
              </dl>
              {replay.selectedRecordedEvent ? (
                <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-2 text-[10px]">
                  <dt className="text-safe-text-muted">{vi ? "Mã sự kiện" : "Event ID"}</dt><dd className="break-all font-mono">{replay.selectedRecordedEvent.id}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Thời điểm replay" : "Replay cursor"}</dt><dd className="font-mono">{formatCaseTime(now)}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Nguồn" : "Source"}</dt><dd>{replay.selectedRecordedEvent.source}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Nguồn gốc" : "Provenance"}</dt><dd>{replay.selectedRecordedEvent.kind}</dd>
                  <dt className="text-safe-text-muted">{vi ? "Xem xét" : "Review"}</dt><dd className="font-bold text-safe-yellow">{vi ? "CẦN NGƯỜI ĐỌC XEM XÉT" : "REQUIRES HUMAN REVIEW"}</dd>
                </dl>
              ) : (
                <p className="text-[10px] leading-relaxed text-safe-text-muted">
                  {vi
                    ? "Chọn một sự kiện để đưa đồng hồ replay tới thời điểm bằng chứng khả dụng. Chỉ sự kiện VitalDB đã ghi và sự kiện dẫn xuất có định nghĩa được hỗ trợ mới xuất hiện."
                    : "Select an event to seek the shared replay cursor to when its evidence is available. Only recorded VitalDB annotations and supported derived events are shown."}
                </p>
              )}
            </ClinicalPanel>
          </>
        )}

        {module === "UC03" && (
          <>
            <ClinicalPanel
              title={vi ? "Dữ liệu bơm truyền đã ghi" : "Recorded infusion-pump source tracks"}
              subtitle={vi ? "Track thiết bị quan sát được; không diễn giải thành lần dùng thuốc." : "Observed device tracks; not interpreted as medication administrations."}
              icon={Pill}
              status={<span className="rounded-sm border border-safe-yellow/40 px-1.5 py-0.5 text-[9px] font-bold text-safe-yellow">{vi ? "KHÔNG SUY DIỄN" : "NO ADMINISTRATION INFERENCE"}</span>}
              scrollBehavior="auto"
            >
              <div className="mb-2 rounded-sm border border-safe-yellow/40 bg-safe-yellow/5 px-3 py-2 text-[11px] font-semibold text-safe-yellow">
                {vi
                  ? "Không có dữ liệu dùng thuốc có thẩm quyền cho ca VitalDB này."
                  : "No authoritative medication administration data available for this VitalDB case."}
              </div>
              {pumpTrackRows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
                    <thead className="sticky top-0 bg-safe-surface text-[9px] uppercase tracking-wide text-safe-text-muted">
                      <tr>
                        <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Track thiết bị" : "Device track"}</th>
                        <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Giá trị ghi nhận" : "Recorded value"}</th>
                        <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Thời điểm" : "Timestamp"}</th>
                        <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Nguồn" : "Source"}</th>
                        <th className="border-b border-safe-border-subtle px-2 py-1.5">{vi ? "Phân loại" : "Classification"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pumpTrackRows.map(({ track, observation }) => (
                        <tr key={track.track_name} className="border-b border-safe-border-subtle/70">
                          <td className="break-all px-2 py-1.5 font-mono">{track.track_name}</td>
                          <td className="px-2 py-1.5 font-mono tabular-nums">
                            {observation?.is_missing || observation?.value == null
                              ? (vi ? "KHÔNG KHẢ DỤNG" : "UNAVAILABLE")
                              : (
                                <>
                                  {formatValue(observation.value)}
                                  {(() => {
                                    const displayUnit = resolveClinicalDisplayUnit(track.track_name, observation.unit ?? track.unit);
                                    return displayUnit ? <> <span className="text-safe-text-muted">{displayUnit}</span></> : null;
                                  })()}
                                </>
                              )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono tabular-nums">{observation ? formatCaseTime(observation.timestamp) : "—"}</td>
                          <td className="break-words px-2 py-1.5 text-safe-text-muted">{track.source ?? "NOT_RECORDED"}</td>
                          <td className="whitespace-nowrap px-2 py-1.5 text-safe-yellow">
                            {vi ? "TRACK BƠM TRUYỀN ĐÃ QUAN SÁT" : "OBSERVED PUMP TRACK"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex min-h-36 items-center justify-center rounded-sm border border-dashed border-safe-border p-4 text-center text-[11px] text-safe-text-muted">
                  {vi ? "Không có track bơm truyền được ghi nhận." : "No infusion-pump source tracks are recorded for this case."}
                </div>
              )}
            </ClinicalPanel>
            <ClinicalPanel
              title={vi ? "Giới hạn UC03" : "UC03 data boundary"}
              subtitle={vi ? "Dữ liệu gốc giữ nguyên ý nghĩa nguồn" : "Source semantics are preserved"}
              icon={Pill}
              scrollBehavior="auto"
            >
              <ul className="list-disc space-y-2 pl-4 text-[10px] leading-relaxed text-safe-text-muted">
                <li>{vi ? "Track bơm truyền không tự chứng minh thuốc, liều hoặc việc dùng thuốc." : "A pump track alone does not establish drug identity, dose, or administration."}</li>
                <li>{vi ? "Dị ứng, y lệnh, can thiệp và xác nhận lâm sàng không có nguồn xác thực sẽ hiển thị là KHÔNG ĐƯỢC GHI NHẬN." : "Allergies, orders, interventions, and clinician confirmations without authoritative source data remain NOT_RECORDED."}</li>
                <li>{vi ? "Không có hành động sửa liều hoặc override trong dữ liệu hồi cứu." : "No dose modification or override action is inferred from retrospective tracks."}</li>
              </ul>
            </ClinicalPanel>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const semantic = normalized === "OBSERVED" || normalized === "GOOD"
    ? "border-safe-green/40 bg-safe-green/5 text-safe-green"
    : normalized === "DERIVED" || normalized === "DEGRADED" || normalized === "UNKNOWN"
      ? "border-safe-yellow/40 bg-safe-yellow/5 text-safe-yellow"
      : normalized.includes("MISSING") || normalized.includes("UNAVAILABLE")
        ? "border-safe-red/40 bg-safe-red/5 text-safe-red"
        : "border-safe-border bg-safe-bg text-safe-text-muted";
  return <span className={`inline-flex rounded-sm border px-1.5 py-0.5 text-[9px] font-bold ${semantic}`}>{value}</span>;
}

function EmptyRow({ columns, label }: { columns: number; label: string }) {
  return <tr><td colSpan={columns} className="px-2 py-5 text-center text-safe-text-muted">{label}</td></tr>;
}

function formatCaseTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3_600).toString().padStart(2, "0");
  const minutes = Math.floor((total % 3_600) / 60).toString().padStart(2, "0");
  const remainder = (total % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}:${remainder}`;
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

const CLINICAL_SIGNAL_UNIT_MAP: Record<string, string> = {
  SPO2: "%",
  PR: "/min",
  HR: "/min",
  RR: "/min",
  ETCO2: "mmHg",
  MAP: "mmHg",
  SBP: "mmHg",
  DBP: "mmHg",
  ART_MBP: "mmHg",
  ART_SBP: "mmHg",
  ART_DBP: "mmHg",
  CVP: "mmHg",
  ST_II: "mm",
  BT: "°C",
  TEMP: "°C",
  TOF: "%",
  BIS: "",
};

function resolveClinicalDisplayUnit(signalOrTrack: unknown, unit: unknown): string {
  const clean = typeof unit === "string" ? unit.trim() : "";
  if (clean && clean.toUpperCase() !== "NOT_RECORDED") {
    return clean;
  }
  if (!signalOrTrack || typeof signalOrTrack !== "string") return "";
  const key = signalOrTrack.toUpperCase();
  if (CLINICAL_SIGNAL_UNIT_MAP[key]) return CLINICAL_SIGNAL_UNIT_MAP[key];
  const subKey = key.split("/").pop() ?? key;
  if (CLINICAL_SIGNAL_UNIT_MAP[subKey]) return CLINICAL_SIGNAL_UNIT_MAP[subKey];
  return "";
}

