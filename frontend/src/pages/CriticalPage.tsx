import { Fragment, useState } from "react";
import { api } from "../api/client";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { useAsyncData } from "../hooks/useDashboardData";
import { STATUS_COLORS } from "../lib/constants";
import type { DataStatus, Status } from "../types";

type CriticalRow = {
  email: string;
  display_name: string;
  class_label: string;
  status: Status;
  hours: number;
  required: number;
  pct: number;
  avg_week: number;
  pace_needed: number;
  pace_gap: number;
  recent_hours: number;
  pending_hours: number;
  final_required: number;
  final_still_needed: number;
  weeks_remaining_to_cp4: number;
  projected_final_hours: number;
  projected_final_gap: number;
  outreach_sent: boolean;
  sent_date: string | null;
  notes: string;
};

export function CriticalPage({
  onOpenProfile,
  dataStatus,
}: {
  onOpenProfile: (email: string) => void;
  dataStatus: DataStatus | null;
}) {
  const activeCheckpoint = dataStatus?.active_checkpoint ?? "CP3";
  const dataLoaded = Boolean(dataStatus?.last_loaded_at);
  const critical = useAsyncData(() => api.getCritical(), [activeCheckpoint, dataLoaded], dataLoaded);
  const [localState, setLocalState] = useState<Map<string, { sent: boolean; notes: string }>>(new Map());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [selectedSupportRow, setSelectedSupportRow] = useState<CriticalRow | null>(null);

  const rows = (critical.data ?? []) as unknown as CriticalRow[];

  const getState = (row: CriticalRow) => {
    const local = localState.get(row.email);
    return {
      sent: local?.sent ?? row.outreach_sent,
      notes: local?.notes ?? row.notes,
    };
  };

  const toggleSupport = async (row: CriticalRow) => {
    const current = getState(row);
    const next = !current.sent;
    setLocalState((prev) => {
      const m = new Map(prev);
      m.set(row.email, { sent: next, notes: current.notes });
      return m;
    });
    setSaving((prev) => new Set(prev).add(row.email));
    try {
      await api.updateSupport(row.email, next, current.notes);
    } catch (e) {
      // revert
      setLocalState((prev) => {
        const m = new Map(prev);
        m.set(row.email, { sent: current.sent, notes: current.notes });
        return m;
      });
      console.error(e);
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(row.email); return s; });
    }
  };

  const saveNotes = async (row: CriticalRow, notes: string) => {
    const current = getState(row);
    setLocalState((prev) => {
      const m = new Map(prev);
      m.set(row.email, { sent: current.sent, notes });
      return m;
    });
    setSaving((prev) => new Set(prev).add(row.email));
    try {
      await api.updateSupport(row.email, current.sent, notes);
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(row.email); return s; });
    }
  };

  const toggleNotes = (email: string) => {
    setNotesOpen((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  };

  const sentCount = rows.filter((r) => getState(r).sent).length;

  const resetAll = async () => {
    const emails = rows.map((row) => row.email);
    setSaving(new Set(emails));
    try {
      await api.resetCritical(emails);
      critical.setData(await api.getCritical());
      setLocalState(new Map());
      setNotesOpen(new Set());
      setShowResetConfirm(false);
    } finally {
      setSaving(new Set());
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text)" }}>Critical</h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            Red and Blue members — track support outreach
          </p>
        </div>
        {!critical.loading && rows.length > 0 && (
          <div className="text-right">
            <div className="text-[20px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
              {sentCount} / {rows.length}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>outreach sent</div>
          </div>
        )}
      </div>

      {!dataLoaded && (
        <div className="rounded-xl p-6 text-[13px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
          Loading dashboard data before checking critical members...
        </div>
      )}

      {critical.loading && <CriticalSkeleton />}

      {!critical.loading && rows.length > 0 && (
        <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full table-fixed text-[12px]">
            <colgroup>
              <col style={{ width: "28px" }} />
              <col style={{ width: "220px" }} />
              <col style={{ width: "88px" }} />
              <col style={{ width: "82px" }} />
              <col style={{ width: "96px" }} />
              <col style={{ width: "132px" }} />
              <col style={{ width: "72px" }} />
              <col />
            </colgroup>
            <thead>
              <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
                <th className="w-8 px-4 py-3" />
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Name</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Class</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Status</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Hours</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Progress</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Support</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const state = getState(row);
                const color = STATUS_COLORS[row.status];
                const pct = Math.min(100, row.pct);
                const isSaving = saving.has(row.email);
                const notesExpanded = notesOpen.has(row.email);

                return (
                  <Fragment key={row.email}>
                    <tr
                      style={{
                        background: state.sent ? "#27ae6008" : (i % 2 === 0 ? "var(--surface)" : "var(--row-alt)"),
                        borderBottom: notesExpanded ? "none" : "1px solid var(--bg-1)",
                        opacity: isSaving ? 0.6 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <td className="px-4 py-3">
                        <div
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: color }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => onOpenProfile(row.email)}
                          className="truncate font-medium hover:underline"
                          style={{ color: "var(--text)" }}
                        >
                          {row.display_name}
                        </button>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--text-3)" }}>{row.class_label}</td>
                      <td className="px-4 py-3">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ background: `${color}18`, color }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--text)" }}>
                        {Number(row.hours).toFixed(1)}
                        <span className="ml-1 text-[11px]" style={{ color: "var(--text-faint)" }}>/ {Number(row.required).toFixed(0)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1 w-20 overflow-hidden rounded-full" style={{ background: "var(--hover)" }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <span className="text-[11px] tabular-nums font-semibold" style={{ color }}>{pct.toFixed(0)}%</span>
                          </div>
                          <button
                            onClick={() => setSelectedSupportRow(row)}
                            className="text-left text-[11px] font-medium transition-opacity hover:opacity-70"
                            style={{ color: row.projected_final_gap > 0 ? "#f39c12" : "#27ae60" }}
                          >
                            {row.projected_final_gap > 0 ? "View support plan →" : "On pace →"}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <button
                            onClick={() => toggleSupport(row)}
                            disabled={isSaving}
                            className="flex h-5 w-5 items-center justify-center rounded transition-all"
                            style={{
                              background: state.sent ? "#27ae6020" : "transparent",
                              border: `1.5px solid ${state.sent ? "#27ae60" : "var(--text-faint)"}`,
                            }}
                          >
                            {state.sent && (
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3.5 6L8 1" stroke="#27ae60" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleNotes(row.email)}
                          className="block w-full truncate text-left text-[11px] transition-colors"
                          style={{ color: state.notes ? "var(--text-3)" : "var(--text-faint)" }}
                        >
                          {state.notes ? state.notes.slice(0, 40) + (state.notes.length > 40 ? "…" : "") : "Add note…"}
                        </button>
                      </td>
                    </tr>
                    {notesExpanded && (
                      <tr
                        key={`${row.email}-notes`}
                        style={{
                          background: state.sent ? "#27ae6008" : (i % 2 === 0 ? "var(--surface)" : "var(--row-alt)"),
                          borderBottom: "1px solid var(--bg-1)",
                        }}
                      >
                        <td colSpan={8} className="px-4 pb-3">
                          <NotesEditor
                            value={state.notes}
                            onSave={(n) => saveNotes(row, n)}
                            onClose={() => toggleNotes(row.email)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <div className="border-t px-4 py-3 text-right" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
            <button
              onClick={() => setShowResetConfirm(true)}
              disabled={!rows.length}
              className="rounded-lg px-3 py-2 text-[11px] font-medium disabled:opacity-40"
              style={{ background: "#e74c3c18", border: "1px solid #e74c3c30", color: "#e74c3c" }}
            >
              Reset all support checks and notes
            </button>
          </div>
        </div>
      )}

      {!critical.loading && rows.length === 0 && (
        <div className="py-16 text-center text-[13px]" style={{ color: "var(--text-faint)" }}>
          No critical members — data may not be loaded
        </div>
      )}

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <div className="animate-fade-up">
            <div className="space-y-4">
              <div>
                <h2 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>Reset support tracking?</h2>
                <p className="mt-2 text-[13px]" style={{ color: "var(--text-3)" }}>
                  This will clear every checkmark and note currently shown in the critical list.
                </p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="rounded-lg px-4 py-2 text-[12px]"
                  style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={resetAll}
                  className="rounded-lg px-4 py-2 text-[12px] font-medium"
                  style={{ background: "#e74c3c", color: "#fff" }}
                >
                  Reset everything
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedSupportRow != null} onOpenChange={(open) => { if (!open) setSelectedSupportRow(null); }}>
        <DialogContent>
          <div className="animate-fade-up">
            {selectedSupportRow && <CriticalSupportModal row={selectedSupportRow} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotesEditor({ value, onSave, onClose }: { value: string; onSave: (n: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value);

  const save = () => {
    onSave(draft);
    onClose();
  };

  return (
    <div className="flex items-end gap-2">
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder="Notes…"
        style={{ fontSize: 11, padding: "6px 8px", resize: "none" }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } if (e.key === "Escape") onClose(); }}
      />
      <div className="flex gap-1.5">
        <button
          onClick={save}
          className="rounded px-2.5 py-1.5 text-[11px] font-medium"
          style={{ background: "#3498db18", color: "#3498db", border: "1px solid #3498db30" }}
        >
          Save
        </button>
        <button
          onClick={onClose}
          className="rounded px-2.5 py-1.5 text-[11px]"
          style={{ color: "var(--text-muted)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function CriticalSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl" style={{ border: "1px solid var(--border)" }}>
      <div className="h-10" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }} />
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse-soft"
          style={{ height: 44, background: i % 2 === 0 ? "var(--surface)" : "var(--row-alt)", animationDelay: `${i * 40}ms`, borderBottom: "1px solid var(--bg-1)" }}
        />
      ))}
    </div>
  );
}

function CriticalSupportModal({ row }: { row: CriticalRow }) {
  const statusColor = STATUS_COLORS[row.status];
  const projectedTone = row.projected_final_gap > 0 ? "#f39c12" : "#27ae60";
  const supportMessage =
    row.status === "Blue"
      ? "No logged hours yet. This is a plan-building conversation first."
      : row.projected_final_gap > 0
        ? "Current pace still leaves a final gap. This is where concrete weekly planning will help."
        : "Current average pace is enough to finish, but this member still needs checkpoint follow-up.";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-[24px] font-semibold" style={{ color: "var(--text)" }}>{row.display_name}</h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
            {row.class_label} · support and pacing snapshot
          </p>
        </div>
        <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: `${statusColor}18`, color: statusColor }}>
          {row.status}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4 border-b pb-4" style={{ borderColor: "var(--border)" }}>
        <SupportStat label="Checkpoint hrs" value={`${Number(row.hours).toFixed(1)} / ${Number(row.required).toFixed(1)}`} accent="#3498db" />
        <SupportStat label="Recent 2w" value={`${Number(row.recent_hours).toFixed(1)} hrs`} accent={row.recent_hours > 0 ? "#27ae60" : "#e74c3c"} />
        <SupportStat label="Avg active wk" value={`${Number(row.avg_week).toFixed(1)} hrs`} accent="var(--text)" />
        <SupportStat label="Need / wk" value={`${Number(row.pace_needed).toFixed(1)} hrs`} accent="#f39c12" />
        <SupportStat label="Pending" value={`${Number(row.pending_hours).toFixed(1)} hrs`} accent="var(--text-2)" />
      </div>

      <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1.1fr_0.9fr]">
        <div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Projected finish</div>
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <div className="text-[26px] font-bold tabular-nums" style={{ color: projectedTone }}>
                {Number(row.projected_final_hours).toFixed(1)} hrs
              </div>
              <div className="mt-1 text-[13px]" style={{ color: "var(--text-3)" }}>
                at current pace · {Math.max(Number(row.weeks_remaining_to_cp4 ?? 0), 0)} weeks left
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>Final goal</div>
              <div className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {Number(row.final_required).toFixed(1)}
              </div>
            </div>
          </div>
          <div className="mt-3 text-[13px] leading-6" style={{ color: "var(--text-2)" }}>
            {supportMessage}
          </div>
        </div>

        <div>
          <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>Support readout</div>
          <div className="space-y-2.5">
            <SupportLine label="Gap vs weekly finish pace" value={`${Number(row.pace_gap).toFixed(1)} hrs / wk`} tone={row.pace_gap > 0 ? "#e74c3c" : "#27ae60"} />
            <SupportLine label="Still needed for CP4" value={`${Number(row.final_still_needed).toFixed(1)} hrs`} tone="var(--text)" />
            <SupportLine label="Projected final gap" value={`${Number(row.projected_final_gap).toFixed(1)} hrs`} tone={projectedTone} />
            <SupportLine label="Checkpoint progress" value={`${Number(row.pct).toFixed(0)}%`} tone={statusColor} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SupportStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.1em]" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold" style={{ color: accent }}>{value}</div>
    </div>
  );
}

function SupportLine({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px]" style={{ color: "var(--text-3)" }}>{label}</span>
      <span className="shrink-0 text-[14px] font-semibold tabular-nums" style={{ color: tone }}>{value}</span>
    </div>
  );
}
