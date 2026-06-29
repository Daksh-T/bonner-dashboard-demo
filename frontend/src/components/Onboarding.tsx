import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Download, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { api } from "../api/client";
import { applyTheme } from "../lib/theme";
import { exportSettingsFile } from "../lib/settingsFile";
import type { AppConfig, Cohort, DataStatus } from "../types";

const ACCENT = "#3498db";
const card = { background: "var(--surface-2)", border: "1px solid var(--border)" } as const;

export function Onboarding({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: (s?: DataStatus) => void;
}) {
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [uploaded, setUploaded] = useState<{ users: boolean; impacts: boolean }>({ users: false, impacts: false });
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  const patch = (p: Partial<AppConfig>) => setConfig((c) => (c ? { ...c, ...p } : c));

  const STEPS = ["Welcome", "Export & upload", "Program", "Checkpoints & cohorts", "Confirm cohorts", "Reflections", "Exemptions", "Appearance", "Finish"];
  const last = STEPS.length - 1;

  const next = () => setStep((s) => Math.min(last, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  // When entering the "confirm cohorts" step, persist current config + reload so
  // members reflect the uploaded CSVs and the configured cohorts.
  const enterConfirm = async () => {
    if (!config) return;
    setBusy("confirm");
    setError(null);
    try {
      const res = await api.updateConfig(config);
      if (res.load_error) setError(res.load_error);
      setMembers((await api.getMembers()) as unknown as Array<Record<string, unknown>>);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const finish = async () => {
    if (!config) return;
    setBusy("finish");
    try {
      const res = await api.updateConfig(config);
      applyTheme(config.theme === "light" ? "light" : "dark");
      onComplete(res.data);
    } finally {
      setBusy(null);
    }
  };

  if (!config) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay)" }}>
      <div className="flex w-full max-w-2xl flex-col rounded-2xl" style={{ background: "var(--surface)", border: "1px solid var(--border-3)", maxHeight: "90vh" }}>
        {/* header */}
        <div className="flex items-center justify-between px-6 pb-3 pt-5">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--text-faint)" }}>
            Setup · {step + 1}/{STEPS.length} · {STEPS[step]}
          </div>
          <button onClick={onClose} style={{ color: "var(--text-muted)" }} className="rounded-md p-1"><X size={16} /></button>
        </div>
        <div className="flex gap-1.5 px-6">
          {STEPS.map((_, i) => (
            <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? ACCENT : "var(--border-3)" }} />
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg p-2.5 text-[12px]" style={{ background: "#e74c3c0d", border: "1px solid #e74c3c33", color: "#e88" }}>{error}</div>
          )}

          {step === 0 && <Welcome />}
          {step === 1 && <ExportUpload uploaded={uploaded} setUploaded={setUploaded} setBusy={setBusy} busy={busy} />}
          {step === 2 && <ProgramStep config={config} patch={patch} />}
          {step === 3 && <CheckpointsStep config={config} patch={patch} />}
          {step === 4 && <ConfirmCohorts members={members} config={config} patch={patch} busy={busy === "confirm"} reload={enterConfirm} />}
          {step === 5 && <ReflectionsStep config={config} patch={patch} />}
          {step === 6 && <ExemptionsStep />}
          {step === 7 && <AppearanceStep config={config} patch={patch} />}
          {step === 8 && <FinishStep config={config} />}
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t px-6 py-4" style={{ borderColor: "var(--border)" }}>
          <button onClick={step === 0 ? onClose : back} className="flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium"
            style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}>
            {step === 0 ? "Skip" : <><ChevronLeft size={14} /> Back</>}
          </button>
          {step === last ? (
            <button onClick={finish} disabled={busy === "finish"} className="flex items-center gap-1.5 rounded-lg px-5 py-2 text-[12px] font-medium" style={{ background: ACCENT, color: "#fff" }}>
              {busy === "finish" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Finish & save
            </button>
          ) : (
            <button
              onClick={() => { if (step === 3) { next(); enterConfirm(); } else { next(); } }}
              className="flex items-center gap-1 rounded-lg px-4 py-2 text-[12px] font-medium" style={{ background: ACCENT, color: "#fff" }}>
              Next <ChevronRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---- steps ---------------------------------------------------------------- //
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--text-2)" }}>{children}</div>;
}
function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-lg p-3 text-[12px] leading-relaxed" style={{ background: "#3498db0d", border: "1px solid #3498db33", color: "var(--text-2)" }}>
      {children}
    </div>
  );
}

function Welcome() {
  return (
    <div>
      <H>Welcome to the Bonner Hour Dashboard 👋</H>
      <P>
        <p>This tool tracks service-hour progress against your program's checkpoints — risk status, partner activity,
          reflection completion, exemptions, exports, and Slack-ready messages.</p>
        <p className="mt-3">It runs entirely on your <strong>GivePulse CSV exports</strong>. This quick setup will walk you
          through exporting your data, defining your checkpoints and cohorts, and saving a portable settings file you can
          reuse next time.</p>
      </P>
    </div>
  );
}

function ExportUpload({
  uploaded, setUploaded, setBusy, busy,
}: {
  uploaded: { users: boolean; impacts: boolean };
  setUploaded: (u: { users: boolean; impacts: boolean }) => void;
  setBusy: (s: string | null) => void;
  busy: string | null;
}) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const upload = async (kind: "users" | "impacts", file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) return;
    setBusy(kind);
    try {
      await api.uploadCsv(kind, file);
      setUploaded({ ...uploaded, [kind]: true });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div>
      <H>Export your data from GivePulse</H>
      <P>Do this for both <strong>Users</strong> and <strong>Impacts</strong>, then upload the two files below. Large
        exports are emailed to you — grab the file from that link.</P>

      <div className="mt-4 space-y-3">
        <Instruction
          title="Users export"
          steps={[
            "GivePulse → Manage → your group name → Users → Manage Users",
            "Sort/filter the date columns so it's just this semester",
            "Click the blue Actions button → Export → All Data",
            "Download the file (or grab it from the email link), then upload it below",
          ]}
        />
        <Instruction
          title="Impacts export"
          steps={[
            "GivePulse → Impacts → Manage Impacts",
            "Refine the dates to this semester (important!)",
            "Click the blue Actions button → Export → All Data",
            "Download the file (or grab it from the email link), then upload it below",
          ]}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {(["users", "impacts"] as const).map((kind) => (
          <label key={kind} className="flex cursor-pointer flex-col items-center gap-2 rounded-xl p-5 text-center"
            style={{
              border: `1px dashed ${dragOver === kind ? "#3498db" : uploaded[kind] ? "#27ae6066" : "var(--border-3)"}`,
              background: dragOver === kind ? "#3498db14" : "var(--surface-2)",
            }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(kind); }}
            onDragLeave={() => setDragOver((d) => (d === kind ? null : d))}
            onDrop={(e) => { e.preventDefault(); setDragOver(null); const f = e.dataTransfer.files?.[0]; if (f) upload(kind, f); }}>
            {busy === kind ? <Loader2 size={18} className="animate-spin" style={{ color: ACCENT }} />
              : uploaded[kind] ? <Check size={18} style={{ color: "#27ae60" }} />
              : <Upload size={18} style={{ color: "var(--text-muted)" }} />}
            <span className="text-[12px] font-medium" style={{ color: "var(--text-2)" }}>
              {uploaded[kind] ? `${kind}-*.csv uploaded` : `Upload ${kind}-*.csv`}
            </span>
            <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(kind, f); e.target.value = ""; }} />
          </label>
        ))}
      </div>
      <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Files are stored locally and reused until you upload newer ones. You can skip this if you've already loaded data.
      </p>
    </div>
  );
}

function Instruction({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-xl p-3.5" style={card}>
      <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>{title}</div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ProgramStep({ config, patch }: { config: AppConfig; patch: (p: Partial<AppConfig>) => void }) {
  return (
    <div>
      <H>Program basics</H>
      <P>Name your program and set when it starts. The last checkpoint's date becomes the program end.</P>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Program name"><input value={config.program_name} onChange={(e) => patch({ program_name: e.target.value })} /></Field>
        <Field label="Program start"><input type="date" value={config.program_start} onChange={(e) => patch({ program_start: e.target.value })} /></Field>
      </div>
    </div>
  );
}

function CheckpointsStep({ config, patch }: { config: AppConfig; patch: (p: Partial<AppConfig>) => void }) {
  const cohorts = config.cohorts;
  const setCohort = (i: number, p: Partial<Cohort>) => patch({ cohorts: cohorts.map((c, idx) => idx === i ? { ...c, ...p } : c) });
  const addCohort = () => patch({ cohorts: [...cohorts, { id: `cohort${cohorts.length + 1}`, label: "New cohort", grad_years: [], is_default: false }] });
  const removeCohort = (i: number) => {
    const removed = cohorts[i];
    patch({
      cohorts: cohorts.filter((_, idx) => idx !== i),
      checkpoints: config.checkpoints.map((cp) => { const r = { ...cp.requirements }; delete r[removed.id]; return { ...cp, requirements: r }; }),
    });
  };
  const setDefault = (i: number) => patch({ cohorts: cohorts.map((c, idx) => ({ ...c, is_default: idx === i })) });

  const cps = config.checkpoints;
  const setCp = (i: number, p: Partial<(typeof cps)[number]>) => patch({ checkpoints: cps.map((cp, idx) => idx === i ? { ...cp, ...p } : cp) });
  const setReq = (i: number, id: string, v: number) => patch({ checkpoints: cps.map((cp, idx) => idx === i ? { ...cp, requirements: { ...cp.requirements, [id]: v } } : cp) });
  const addCp = () => { const r: Record<string, number> = {}; cohorts.forEach((c) => r[c.id] = 0); patch({ checkpoints: [...cps, { name: `CP${cps.length + 1}`, date: config.program_start, requirements: r }] }); };
  const removeCp = (i: number) => patch({ checkpoints: cps.filter((_, idx) => idx !== i) });

  return (
    <div>
      <H>Checkpoints & cohorts</H>
      <P>Cohorts are requirement tiers (e.g. seniors vs. everyone else), matched by graduation year. Each checkpoint has a
        date and an hour target per cohort.</P>

      <div className="mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Cohorts</div>
      <div className="mt-2 space-y-2">
        {cohorts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.3fr_auto_auto] items-center gap-2">
            <input value={c.label} onChange={(e) => setCohort(i, { label: e.target.value })} placeholder="Label" />
            <input value={c.grad_years.join(", ")} onChange={(e) => setCohort(i, { grad_years: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x)) })} placeholder="Grad years e.g. 2026" />
            <button type="button" onClick={() => setDefault(i)} className="rounded-lg px-2.5 py-2 text-[11px] font-medium"
              style={{ background: c.is_default ? "#3498db22" : "var(--surface-2)", border: c.is_default ? "1px solid #3498db66" : "1px solid var(--border-3)", color: c.is_default ? "#7cc0e8" : "var(--text-muted)" }}>
              {c.is_default ? "✓ default" : "default"}
            </button>
            <button onClick={() => removeCohort(i)} disabled={cohorts.length <= 1} className="rounded-lg p-2 disabled:opacity-30" style={{ background: "#e74c3c14", color: "#e74c3c" }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <Ghost onClick={addCohort}><Plus size={13} /> Add cohort</Ghost>

      <div className="mt-5 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Checkpoints</div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th className="px-1.5 py-1.5 text-left text-[11px]" style={{ color: "var(--text-muted)" }}>Name</th>
            <th className="px-1.5 py-1.5 text-left text-[11px]" style={{ color: "var(--text-muted)" }}>Date</th>
            {cohorts.map((c) => <th key={c.id} className="px-1.5 py-1.5 text-left text-[11px]" style={{ color: "var(--text-muted)" }}>{c.label}</th>)}
            <th />
          </tr></thead>
          <tbody>
            {cps.map((cp, i) => (
              <tr key={i}>
                <td className="px-1.5 py-1"><input value={cp.name} onChange={(e) => setCp(i, { name: e.target.value })} style={{ width: 70 }} /></td>
                <td className="px-1.5 py-1"><input type="date" value={cp.date} onChange={(e) => setCp(i, { date: e.target.value })} style={{ width: 140 }} /></td>
                {cohorts.map((c) => (
                  <td key={c.id} className="px-1.5 py-1"><input type="number" step="0.01" style={{ width: 75 }} value={cp.requirements[c.id] ?? 0} onChange={(e) => setReq(i, c.id, parseFloat(e.target.value) || 0)} /></td>
                ))}
                <td className="px-1.5 py-1"><button onClick={() => removeCp(i)} className="rounded-lg p-1.5" style={{ background: "#e74c3c14", color: "#e74c3c" }}><Trash2 size={12} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Ghost onClick={addCp}><Plus size={13} /> Add checkpoint</Ghost>

      <Hint>
        There's more in <strong>Settings → Checkpoints &amp; cohorts</strong>: map graduation years to display classes
        (class labels), choose which CSV columns hold the graduation year / class, and — if auto-detection fails for
        your export — pick seniors or assign classes (Freshman, Sophomore, …) to members by hand.
      </Hint>
    </div>
  );
}

function ConfirmCohorts({
  members, config, patch, busy, reload,
}: {
  members: Array<Record<string, unknown>>;
  config: AppConfig;
  patch: (p: Partial<AppConfig>) => void;
  busy: boolean;
  reload: () => void;
}) {
  const byClass = useMemo(() => {
    const m = new Map<string, number>();
    members.forEach((x) => { const k = String(x.class_label ?? "Other"); m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);
  const byCohort = useMemo(() => {
    const m = new Map<string, number>();
    members.forEach((x) => { const k = String(x.cohort_label ?? "—"); m.set(k, (m.get(k) ?? 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [members]);

  return (
    <div>
      <H>Confirm your cohorts</H>
      <P>Based on the uploaded data and your cohort rules, here's how members were detected. If your seniors aren't
        landing in the right tier, go back and adjust the cohort graduation years.</P>

      <div className="mt-4 flex items-center gap-2">
        <Ghost onClick={reload}>{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Re-check</Ghost>
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{members.length} members loaded</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <Panel title="By class (display)">
          {byClass.length === 0 ? <Empty /> : byClass.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Panel>
        <Panel title="By requirement cohort">
          {byCohort.length === 0 ? <Empty /> : byCohort.map(([k, v]) => <Row key={k} k={k} v={v} />)}
        </Panel>
      </div>

      <div className="mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Adjust cohort grad years</div>
      <div className="mt-2 space-y-2">
        {config.cohorts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr] items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-2)" }}>{c.label}{c.is_default ? " (default)" : ""}</span>
            <input value={c.grad_years.join(", ")} placeholder="grad years"
              onChange={(e) => patch({ cohorts: config.cohorts.map((x, idx) => idx === i ? { ...x, grad_years: e.target.value.split(",").map((y) => parseInt(y.trim(), 10)).filter((y) => !isNaN(y)) } : x) })} />
          </div>
        ))}
      </div>

      <Hint>
        Still wrong after adjusting? In <strong>Settings → Checkpoints &amp; cohorts</strong> you can mark seniors
        manually and assign any member a class (Freshman, Sophomore, …) by hand — handy when your export has no usable
        graduation year.
      </Hint>
    </div>
  );
}

function ReflectionsStep({ config, patch }: { config: AppConfig; patch: (p: Partial<AppConfig>) => void }) {
  const r = config.reflection;
  const [showPicker, setShowPicker] = useState(false);
  const [columns, setColumns] = useState<string[] | null>(null);
  useEffect(() => {
    if (showPicker && columns === null) {
      api.getDataColumns().then((c) => setColumns(c.impacts ?? [])).catch(() => setColumns([]));
    }
  }, [showPicker, columns]);
  const toggleField = (col: string) => {
    const set = new Set(r.fields);
    set.has(col) ? set.delete(col) : set.add(col);
    patch({ reflection: { ...r, fields: Array.from(set) } });
  };
  return (
    <div>
      <H>Reflections</H>
      <P>Pick which impact columns count as a reflection (you may have custom field names). Leave the list empty to turn
        reflection tracking off.</P>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Reflection fields (one per line)">
          <textarea rows={4} style={{ width: "100%" }} value={r.fields.join("\n")}
            onChange={(e) => patch({ reflection: { ...r, fields: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) } })} placeholder="Review/Reflection" />
          <Ghost onClick={() => setShowPicker((v) => !v)}>{showPicker ? "Hide CSV fields" : "Pick fields from your CSV…"}</Ghost>
          {showPicker && (
            <div className="mt-2 rounded-lg p-3" style={card}>
              {columns === null ? (
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>Loading columns…</div>
              ) : columns.length === 0 ? (
                <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>No impact columns found — upload an impacts CSV first (step 2).</div>
              ) : (
                <>
                  <div className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>Tap a column from your impacts export to toggle it as a reflection field.</div>
                  <div className="flex flex-wrap gap-1.5">
                    {columns.map((col) => {
                      const on = r.fields.includes(col);
                      return (
                        <button key={col} type="button" onClick={() => toggleField(col)} aria-pressed={on}
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                          style={{
                            background: on ? "#3498db22" : "var(--surface)",
                            border: on ? "1px solid #3498db66" : "1px solid var(--border-3)",
                            color: on ? "#7cc0e8" : "var(--text-2)",
                          }}>
                          {on ? "✓ " : ""}{col}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </Field>
        <div className="space-y-3">
          <Field label="Values counted as empty (comma-separated)">
            <input value={r.empty_values.join(", ")} onChange={(e) => patch({ reflection: { ...r, empty_values: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } })} placeholder="n/a, none" />
          </Field>
          <Field label="Mark blank when…">
            <select value={r.blank_rule} onChange={(e) => patch({ reflection: { ...r, blank_rule: e.target.value as "all" | "any" } })}>
              <option value="all">all selected fields are empty</option>
              <option value="any">any selected field is empty</option>
            </select>
          </Field>
        </div>
      </div>
    </div>
  );
}

function AppearanceStep({ config, patch }: { config: AppConfig; patch: (p: Partial<AppConfig>) => void }) {
  return (
    <div>
      <H>Appearance</H>
      <P>Choose a theme. You can change this any time in Settings.</P>
      <div className="mt-4 flex gap-3">
        {(["dark", "light"] as const).map((t) => (
          <button key={t} onClick={() => { patch({ theme: t }); applyTheme(t); }}
            className="flex-1 rounded-xl p-4 text-left capitalize" style={{ background: config.theme === t ? "#3498db14" : "var(--surface-2)", border: config.theme === t ? "1px solid #3498db66" : "1px solid var(--border)" }}>
            <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{t} mode</div>
            <div className="mt-2 flex gap-1.5">
              <span className="h-6 w-6 rounded" style={{ background: t === "dark" ? "#09090b" : "#f4f4f6", border: "1px solid var(--border-3)" }} />
              <span className="h-6 w-6 rounded" style={{ background: t === "dark" ? "#111113" : "#ffffff", border: "1px solid var(--border-3)" }} />
              <span className="h-6 w-6 rounded" style={{ background: ACCENT }} />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ExemptionsStep() {
  return (
    <div>
      <H>Exemptions</H>
      <P>
        <p>Some members shouldn't be held to the hour requirements — study abroad, medical leave, special arrangements.
          Add them as <strong>exemptions</strong> and they're excluded from risk statuses, critical lists, and Slack
          check-in queues, with the reason kept on record.</p>
        <p className="mt-3">You'll find this under <strong>Settings → Exemptions</strong> once members are loaded:
          pick the member, write a reason, done. You can remove an exemption at any time.</p>
      </P>
    </div>
  );
}

function FinishStep({ config }: { config: AppConfig }) {
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  const downloadSettings = async () => {
    setExporting(true);
    setExportMsg(null);
    try {
      // Persist first so the exported file matches what the walkthrough set up.
      const res = await api.updateConfig(config);
      const path = await exportSettingsFile(res.config);
      setExportMsg(path ? `Saved to ${path}` : "Downloaded ✓");
    } catch (e) {
      setExportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <H>You're all set 🎉</H>
      <P>
        <p>Clicking <strong>Finish & save</strong> stores your configuration locally.</p>
        <ul className="mt-3 space-y-1 text-[12px]" style={{ color: "var(--text-3)" }}>
          <li>• Program: <span style={{ color: "var(--text-2)" }}>{config.program_name}</span></li>
          <li>• Checkpoints: <span style={{ color: "var(--text-2)" }}>{config.checkpoints.length}</span></li>
          <li>• Cohorts: <span style={{ color: "var(--text-2)" }}>{config.cohorts.map((c) => c.label).join(", ")}</span></li>
          <li>• Theme: <span style={{ color: "var(--text-2)" }}>{config.theme}</span></li>
        </ul>
        <p className="mt-4">Want a backup? Your whole setup fits in one portable <strong>settings.json</strong>. Download
          it below, and restore it any time — on this or another machine — via <strong>Settings → Appearance → Import
          settings.json</strong>. You can re-export it from there whenever, too.</p>
      </P>
      <div className="mt-3 flex items-center gap-3">
        <Ghost onClick={downloadSettings}>
          {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} Download settings.json
        </Ghost>
        {exportMsg && (
          <span className="text-[12px]" style={{ color: exportMsg.startsWith("Export failed") ? "#e74c3c" : "#27ae60" }}>{exportMsg}</span>
        )}
      </div>
    </div>
  );
}

// ---- little shared bits --------------------------------------------------- //
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--text-faint)" }}>{label}</div>{children}</div>;
}
function Ghost({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button onClick={onClick} className="mt-3 flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-medium" style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}>{children}</button>;
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl p-3" style={card}><div className="mb-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{title}</div><div className="space-y-1">{children}</div></div>;
}
function Row({ k, v }: { k: string; v: number }) {
  return <div className="flex justify-between text-[12px]"><span style={{ color: "var(--text-2)" }}>{k}</span><span className="tabular-nums font-medium" style={{ color: "var(--text)" }}>{v}</span></div>;
}
function Empty() { return <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No members yet — upload CSVs first.</div>; }
