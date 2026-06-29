import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api/client";
import { useAsyncData } from "../hooks/useDashboardData";
import { STATUS_COLORS } from "../lib/constants";
import type { Status } from "../types";
import { Dialog, DialogContent } from "./ui/dialog";
import {
  Bar, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type R = Record<string, unknown>;

export function MemberProfile({
  email,
  activeCheckpoint,
  onClose,
}: {
  email: string;
  activeCheckpoint: string;
  onClose: () => void;
}) {
  const [selectedImpact, setSelectedImpact] = useState<R | null>(null);
  const [closing, setClosing] = useState(false);
  const profile = useAsyncData(() => api.getMemberProfile(email), [email, activeCheckpoint], true);
  const activity = useAsyncData(
    () => fetch(`/api/members/${encodeURIComponent(email)}/activity`).then((r) => r.json()) as Promise<R[]>,
    [email, activeCheckpoint],
    true,
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (selectedImpact) {
        setSelectedImpact(null);
        return;
      }
      setClosing(true);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, selectedImpact]);

  useEffect(() => {
    if (!closing) return;
    const timeout = window.setTimeout(() => onClose(), 180);
    return () => window.clearTimeout(timeout);
  }, [closing, onClose]);

  const dismiss = () => setClosing(true);

  const p      = profile.data as R | null;
  const status = ((p?.status ?? "Exempt") as Status);
  const color  = STATUS_COLORS[status];
  const pct    = Math.min(100, Number(p?.progress_pct ?? 0));

  return (
    <>
      <div
        className={`fixed inset-0 z-40 ${closing ? "animate-fade-out" : "animate-fade-in"}`}
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
        onClick={dismiss}
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-[460px] flex-col overflow-hidden ${closing ? "animate-slide-out" : "animate-slide-in"}`}
        role="dialog"
        aria-modal="true"
        aria-label="Member profile"
        style={{ background: "var(--bg-1)", borderLeft: "1px solid var(--border-2)", boxShadow: "-24px 0 64px rgba(0,0,0,0.6)" }}
      >
        {/* Header */}
        <div className="flex-none px-6 pb-5 pt-6" style={{ borderBottom: "1px solid var(--border-2)" }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[17px] font-semibold" style={{ color: "var(--text)" }}>
                {profile.loading ? "Loading…" : String(p?.display_name ?? "—")}
              </h2>
              <div className="mt-1 flex flex-wrap gap-x-2">
                <span className="text-[12px]" style={{ color: "var(--text-3)" }}>{String(p?.class_label ?? "")}</span>
                {!!p?.email && <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>{String(p.email)}</span>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!!p?.status && (
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: `${color}1a`, color }}
                >
                  {status}
                </span>
              )}
              <button
                onClick={dismiss}
                className="rounded-md p-1.5 transition-colors"
                style={{ color: "var(--text-muted)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text)"; (e.currentTarget as HTMLElement).style.background = "var(--hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {p && (
            <div className="mt-4">
              <div className="mb-1.5 flex justify-between text-[12px]">
                <span style={{ color: "var(--text-3)" }}>
                  {Number(p.hours).toFixed(1)} / {Number(p.required).toFixed(1)} hrs
                </span>
                <span style={{ color, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--hover)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${pct}%`, background: color, transition: "width 0.5s ease" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {profile.loading && <ProfileSkeleton />}

          {p && !profile.loading && (
            <>
              {/* Key metrics */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Hours",       val: Number(p.hours).toFixed(1) },
                  { label: "Active wks",  val: String(p.active_weeks ?? "—") },
                  { label: "Avg / wk",    val: `${Number(p.avg_week ?? 0).toFixed(1)}` },
                  { label: "Need / wk",   val: Number(p.pace_needed ?? 0) > 0 ? Number(p.pace_needed).toFixed(1) : "—" },
                ].map(({ label, val }) => (
                  <div key={label} className="rounded-lg p-2.5 text-center" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
                    <div className="text-[17px] font-bold" style={{ color: "var(--text)" }}>{val}</div>
                    <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Checkpoint progress */}
              {Array.isArray(p.checkpoint_progress) && (p.checkpoint_progress as R[]).length > 0 && (
                <div>
                  <SectionLabel>Checkpoint progress</SectionLabel>
                  <div className="mt-2.5 grid grid-cols-4 gap-2">
                    {(p.checkpoint_progress as R[]).map((cp) => {
                      const required = Number(cp.required ?? cp.req ?? 0);
                      const met = Boolean(cp.met ?? (Number(cp.hours ?? 0) >= required && required > 0));
                      return (
                        <div
                          key={String(cp.name)}
                          className="rounded-lg p-2.5 text-center"
                          style={{
                            background: met ? "#27ae6010" : "var(--surface-3)",
                            border: `1px solid ${met ? "#27ae6028" : "var(--border)"}`,
                          }}
                        >
                          <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{String(cp.name)}</div>
                          <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-3)" }}>{Number(cp.hours ?? 0).toFixed(1)} hrs</div>
                          <div className="mt-1 text-[11px] font-semibold" style={{ color: met ? "#27ae60" : "var(--text-faint)" }}>
                            {met ? "✓ Met" : `Goal ${required.toFixed(1)}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Activity chart */}
              {!activity.loading && (activity.data ?? []).length > 0 && (
                <div>
                  <SectionLabel>Weekly activity</SectionLabel>
                  <div className="mt-2.5">
                    <ResponsiveContainer width="100%" height={124}>
                      <ComposedChart data={activity.data as R[]} margin={{ top: 16, right: 6, bottom: 0, left: -8 }}>
                        <XAxis
                          dataKey="week_label"
                          tick={{ fill: "var(--text-muted)", fontSize: 11, fontFamily: "inherit" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis hide domain={[0, (dataMax: number) => Math.max(dataMax, Number(p.required ?? 0) * 1.08)]} />
                        <Tooltip
                          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-3)", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}
                          itemStyle={{ color: "var(--text)" }}
                          labelStyle={{ color: "var(--text-3)", marginBottom: 2 }}
                          labelFormatter={(value) => `Week of ${String(value)}`}
                          formatter={(v, name) => [`${Number(v ?? 0).toFixed(1)} hrs`, String(name)]}
                        />
                        <Bar dataKey="hours" fill={color} fillOpacity={0.7} radius={[3, 3, 0, 0]} name="Hours" />
                        <Line type="monotone" dataKey="cumulative" stroke="var(--text-faint)" strokeWidth={1.5} dot={false} name="Cumulative" />
                        {Number(p.required ?? 0) > 0 && (
                          <ReferenceLine
                            y={Number(p.required)}
                            stroke="#3498db"
                            strokeDasharray="5 4"
                            strokeWidth={1.5}
                            label={{ value: `Target ${Number(p.required).toFixed(0)}h`, position: "insideTopRight", fill: "#3498db", fontSize: 10, fontWeight: 600 }}
                          />
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Partner breakdown */}
              {Array.isArray(p.partner_breakdown) && (p.partner_breakdown as R[]).length > 0 && (
                <div>
                  <SectionLabel>Service by partner</SectionLabel>
                  <div className="mt-2.5 space-y-2">
                    {(p.partner_breakdown as R[]).slice(0, 6).map((pb) => {
                      const maxH = Number((p.partner_breakdown as R[])[0]?.hours ?? 1);
                      return (
                        <div key={String(pb.partner)} className="flex items-center gap-2.5">
                          <span className="w-32 shrink-0 truncate text-[11px]" style={{ color: "var(--text-2)" }}>{String(pb.partner)}</span>
                          <div className="flex-1 h-1 overflow-hidden rounded-full" style={{ background: "var(--hover)" }}>
                            <div className="h-full rounded-full" style={{ width: `${(Number(pb.hours) / maxH) * 100}%`, background: color }} />
                          </div>
                          <span className="w-10 shrink-0 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                            {Number(pb.hours).toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent impacts */}
              {Array.isArray(p.impact_history) && (p.impact_history as R[]).length > 0 && (
                <div>
                  <SectionLabel>Recent impacts</SectionLabel>
                  <div className="mt-2.5 space-y-1.5">
                    {(p.impact_history as R[]).slice(0, 10).map((imp, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedImpact(imp)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors"
                        style={{ background: "var(--surface-3)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--border)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"; }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px]" style={{ color: "var(--text-bright)" }}>
                            {String(imp.group || imp.event_name || "—")}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{String(imp.start_date ?? imp.date ?? "")}</div>
                        </div>
                        <span className="shrink-0 text-[12px] font-medium tabular-nums" style={{ color: "var(--text)" }}>
                          {Number(imp.hours).toFixed(1)} hrs
                        </span>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                          style={
                            String(imp.verified) === "Verified"
                              ? { background: "#27ae6015", color: "#27ae60" }
                              : { background: "#f39c1215", color: "#f39c12" }
                          }
                        >
                          {String(imp.verified ?? "")}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      <Dialog open={selectedImpact != null} onOpenChange={(open) => { if (!open) setSelectedImpact(null); }}>
        <DialogContent>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
                  {String(selectedImpact?.event_name || selectedImpact?.group || "Impact")}
                </div>
                <div className="mt-1 text-[12px]" style={{ color: "var(--text-3)" }}>
                  {String(selectedImpact?.group || "No partner listed")}
                </div>
              </div>
              <button onClick={() => setSelectedImpact(null)} className="rounded-md p-1.5" style={{ color: "var(--text-muted)" }}>
                <X size={15} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Date", value: String(selectedImpact?.start_date ?? "—") },
                { label: "Hours", value: `${Number(selectedImpact?.hours ?? 0).toFixed(1)} hrs` },
                { label: "Status", value: String(selectedImpact?.verified ?? "—") },
              ].map((item) => (
                <div key={item.label} className="rounded-lg px-3 py-2" style={{ background: "var(--surface-3)", border: "1px solid var(--border)" }}>
                  <div className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>{item.label}</div>
                  <div className="mt-1 text-[13px]" style={{ color: "var(--text)" }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-muted)" }}>
                Reflection / Review
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-6" style={{ color: "var(--text-bright)" }}>
                {String(selectedImpact?.reflection || "No reflection entered.")}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
      {children}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 animate-pulse-soft rounded-lg" style={{ background: "var(--surface-3)", animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <div className="h-20 animate-pulse-soft rounded-lg" style={{ background: "var(--surface-3)", animationDelay: "120ms" }} />
      <div className="h-28 animate-pulse-soft rounded-lg" style={{ background: "var(--surface-3)", animationDelay: "200ms" }} />
    </div>
  );
}
