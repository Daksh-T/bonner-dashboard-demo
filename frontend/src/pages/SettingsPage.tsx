import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { api } from "../api/client";
import { useAsyncData } from "../hooks/useDashboardData";
import { applyTheme } from "../lib/theme";
import { exportSettingsFile } from "../lib/settingsFile";
import { STATUS_COLORS } from "../lib/constants";
import { TemplateEditor, type CheckpointExample, type TemplateEditorHandle, type TemplateToken } from "../components/ui/TemplateEditor";
import type { AppConfig, Cohort, DataStatus, Status } from "../types";

type ExemptionRow = { email: string; name: string; reason: string; created_at: string };
type MemberOption = { email: string; display_name: string; status: string };

type Tab = "data" | "checkpoints" | "reflections" | "roster" | "messages" | "exemptions" | "appearance" | "help";

const TABS: { id: Tab; label: string }[] = [
  { id: "data", label: "Data" },
  { id: "checkpoints", label: "Checkpoints & cohorts" },
  { id: "reflections", label: "Reflections" },
  { id: "roster", label: "Roster export" },
  { id: "messages", label: "Messages" },
  { id: "exemptions", label: "Exemptions" },
  { id: "appearance", label: "Appearance" },
  { id: "help", label: "Help" },
];

const CARD = { background: "var(--surface)", border: "1px solid var(--border)" } as const;
const SUBTLE = { color: "var(--text-muted)" } as const;
const LABEL = "mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em]";

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={CARD}>
      {title && (
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.14em]" style={SUBTLE}>
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-xl px-4 py-2 text-[12px] font-medium disabled:opacity-40"
      style={{ background: "#3498db", color: "#fff" }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg px-3 py-2 text-[12px] font-medium disabled:opacity-40"
      style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}
    >
      {children}
    </button>
  );
}

export function SettingsPage({
  dataStatus,
  onDataStatusChange,
  onConfigChange,
  onOpenWalkthrough,
}: {
  dataStatus: DataStatus | null;
  onDataStatusChange: (status: DataStatus) => void;
  onConfigChange?: () => void;
  onOpenWalkthrough?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("data");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch(() => {});
  }, []);

  const saveConfig = async (patch: Partial<AppConfig>) => {
    setLoadError(null);
    const res = await api.updateConfig(patch);
    setConfig(res.config);
    if (res.data) onDataStatusChange(res.data);
    onConfigChange?.();
    if (res.load_error) setLoadError(res.load_error);
    else { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1800); }
    return res;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[22px] font-semibold" style={{ color: "var(--text)" }}>Settings</h1>
          <p className="mt-0.5 text-[13px]" style={SUBTLE}>
            Configure data source, checkpoints, cohorts, reflections, and exports for your program
          </p>
        </div>
        {savedFlash && (
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "#27ae60" }}>
            <Check size={14} /> Saved
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded-xl p-3 text-[12px]" style={{ background: "#e74c3c0d", border: "1px solid #e74c3c33", color: "#e88" }}>
          Saved, but loading data failed: {loadError}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl p-1 w-fit" style={CARD}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="rounded-lg px-4 py-2 text-[12px] font-medium transition-all"
              style={{
                background: active ? "var(--surface-3)" : "transparent",
                color: active ? "var(--text)" : "var(--text-muted)",
                border: active ? "1px solid var(--border-3)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {!config && <div className="text-[13px]" style={SUBTLE}>Loading configuration…</div>}

      {config && tab === "data" && <DataSourceSection onDataStatusChange={onDataStatusChange} />}
      {config && tab === "checkpoints" && <CheckpointsSection config={config} saveConfig={saveConfig} />}
      {config && tab === "reflections" && <ReflectionsSection config={config} saveConfig={saveConfig} />}
      {config && tab === "roster" && <RosterSection config={config} saveConfig={saveConfig} loaded={!!dataStatus?.loaded} />}
      {config && tab === "messages" && <MessagesSection config={config} saveConfig={saveConfig} />}
      {tab === "exemptions" && <ExemptionsSection dataStatus={dataStatus} onDataStatusChange={onDataStatusChange} />}
      {config && tab === "appearance" && (
        <AppearanceSection config={config} saveConfig={saveConfig} setConfig={setConfig} onDataStatusChange={onDataStatusChange} onConfigChange={onConfigChange} />
      )}
      {tab === "help" && <HelpSection onOpenWalkthrough={onOpenWalkthrough} />}

      <div className="pt-4 text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
        Made with <span style={{ color: "#e74c3c" }}>❤</span> by Daksh, at Sewanee
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Data (CSV upload)
// --------------------------------------------------------------------------- //
function DataSourceSection({ onDataStatusChange }: { onDataStatusChange: (status: DataStatus) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ users?: string; impacts?: string }>({});
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadFile = async (kind: "users" | "impacts", file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setUploadError(`"${file.name}" is not a .csv file.`);
      return;
    }
    setBusy(kind);
    setUploadError(null);
    try {
      const res = await api.uploadCsv(kind, file);
      setDone((d) => ({ ...d, [kind]: res.filename }));
      onDataStatusChange(await api.reloadData());
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="How to export from GivePulse">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ExportHelp title="Users" steps={[
            "Manage → your group → Users → Manage Users",
            "Sort/filter dates to this semester",
            "Blue Actions button → Export → All Data",
            "Download (or use the email link)",
          ]} />
          <ExportHelp title="Impacts" steps={[
            "Impacts → Manage Impacts",
            "Refine the dates to this semester",
            "Blue Actions button → Export → All Data",
            "Download (or use the email link)",
          ]} />
        </div>
      </Card>

      <Card title="Upload CSV exports">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["users", "impacts"] as const).map((kind) => (
            <label
              key={kind}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-xl p-6 text-center transition-colors"
              style={{
                border: `1px dashed ${dragOver === kind ? "#3498db" : done[kind] ? "#27ae6066" : "var(--border-3)"}`,
                background: dragOver === kind ? "#3498db14" : "var(--surface-2)",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(kind); }}
              onDragLeave={() => setDragOver((d) => (d === kind ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const f = e.dataTransfer.files?.[0];
                if (f) uploadFile(kind, f);
              }}
            >
              {busy === kind ? <Loader2 size={18} className="animate-spin" style={{ color: "#3498db" }} />
                : done[kind] ? <Check size={18} style={{ color: "#27ae60" }} />
                : <Upload size={18} style={SUBTLE} />}
              <span className="text-[12px] font-medium" style={{ color: "var(--text-2)" }}>
                {done[kind] ? `${kind} uploaded ✓` : kind === "users" ? "users-*.csv (roster)" : "impacts-*.csv (hours)"}
              </span>
              <span className="text-[11px]" style={SUBTLE}>Click to browse or drag & drop</span>
              <input type="file" accept=".csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(kind, f); e.target.value = ""; }} />
            </label>
          ))}
        </div>
        {uploadError && (
          <p className="mt-3 text-[12px]" style={{ color: "#e74c3c" }}>Upload failed: {uploadError}</p>
        )}
        <p className="mt-3 text-[11px]" style={SUBTLE}>
          Files are stored locally and reused until you upload newer ones. The newest upload of each kind is used automatically.
        </p>
      </Card>
    </div>
  );
}

function ExportHelp({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div>
      <div className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>{title} export</div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[12px]" style={{ color: "var(--text-2)" }}>
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: "var(--surface-3)", color: "var(--text-3)" }}>{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Appearance + portable settings
// --------------------------------------------------------------------------- //
function AppearanceSection({
  config,
  saveConfig,
  setConfig,
  onDataStatusChange,
  onConfigChange,
}: {
  config: AppConfig;
  saveConfig: (patch: Partial<AppConfig>) => Promise<unknown>;
  setConfig: (c: AppConfig) => void;
  onDataStatusChange: (status: DataStatus) => void;
  onConfigChange?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const setTheme = (t: "dark" | "light") => {
    applyTheme(t);
    saveConfig({ theme: t });
  };

  const exportSettings = async () => {
    setImportMsg(null);
    try {
      const path = await exportSettingsFile(config);
      setImportMsg(path ? `Saved to ${path} ✓` : "Downloaded ✓");
    } catch (e) {
      setImportMsg(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const importSettings = async (file: File) => {
    setImportMsg(null);
    try {
      const parsed = JSON.parse(await file.text());
      const res = await api.importConfig(parsed);
      setConfig(res.config);
      applyTheme(res.config.theme === "light" ? "light" : "dark");
      if (res.data) onDataStatusChange(res.data);
      onConfigChange?.();
      setImportMsg("Settings imported ✓");
    } catch (e) {
      setImportMsg(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Theme">
        <div className="flex gap-3">
          {(["dark", "light"] as const).map((t) => (
            <button key={t} onClick={() => setTheme(t)} className="flex-1 rounded-xl p-4 text-left capitalize"
              style={{ background: config.theme === t ? "#3498db14" : "var(--surface-2)", border: config.theme === t ? "1px solid #3498db66" : "1px solid var(--border)" }}>
              <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{t} mode</div>
              <div className="mt-2 flex gap-1.5">
                <span className="h-6 w-6 rounded" style={{ background: t === "dark" ? "#09090b" : "#f4f4f6", border: "1px solid var(--border-3)" }} />
                <span className="h-6 w-6 rounded" style={{ background: t === "dark" ? "#111113" : "#ffffff", border: "1px solid var(--border-3)" }} />
                <span className="h-6 w-6 rounded" style={{ background: "#3498db" }} />
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Portable settings">
        <p className="mb-4 text-[12px]" style={SUBTLE}>
          Export your full configuration (program, checkpoints, cohorts, reflections, roster, theme) to a JSON file, then
          import it on another machine or after a reset to restore everything instantly.
        </p>
        <div className="flex items-center gap-3">
          <button onClick={exportSettings} className="flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium" style={{ background: "#3498db", color: "#fff" }}>
            <Download size={14} /> Export settings.json
          </button>
          <GhostButton onClick={() => fileRef.current?.click()}>Import settings.json</GhostButton>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importSettings(f); e.target.value = ""; }} />
          {importMsg && <span className="text-[12px]" style={{ color: importMsg.includes("✓") ? "#27ae60" : "#e74c3c" }}>{importMsg}</span>}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={LABEL} style={{ color: "var(--text-faint)" }}>{label}</div>
      {children}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Checkpoints & cohorts
// --------------------------------------------------------------------------- //
function CheckpointsSection({ config, saveConfig }: { config: AppConfig; saveConfig: (p: Partial<AppConfig>) => Promise<unknown> }) {
  const [programName, setProgramName] = useState(config.program_name);
  const [programStart, setProgramStart] = useState(config.program_start);
  const [cohorts, setCohorts] = useState<Cohort[]>(config.cohorts);
  const [checkpoints, setCheckpoints] = useState(config.checkpoints);
  const [classLabels, setClassLabels] = useState<Record<string, string>>(config.class_labels);
  const [gradYearField, setGradYearField] = useState(config.grad_year_field);
  const [classField, setClassField] = useState(config.class_field);
  const [manualSeniors, setManualSeniors] = useState<string[]>(config.manual_seniors ?? []);
  const [manualClasses, setManualClasses] = useState<Record<string, string>>(config.manual_classes ?? {});
  const [saving, setSaving] = useState(false);

  const setCohort = (i: number, patch: Partial<Cohort>) =>
    setCohorts((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const addCohort = () => {
    const id = `cohort${cohorts.length + 1}`;
    setCohorts([...cohorts, { id, label: "New cohort", grad_years: [], is_default: false }]);
  };
  const removeCohort = (i: number) => {
    const removed = cohorts[i];
    setCohorts(cohorts.filter((_, idx) => idx !== i));
    setCheckpoints((cps) => cps.map((cp) => {
      const reqs = { ...cp.requirements }; delete reqs[removed.id]; return { ...cp, requirements: reqs };
    }));
  };
  const setDefault = (i: number) => setCohorts((cs) => cs.map((c, idx) => ({ ...c, is_default: idx === i })));

  const setCp = (i: number, patch: Partial<(typeof checkpoints)[number]>) =>
    setCheckpoints((cps) => cps.map((cp, idx) => (idx === i ? { ...cp, ...patch } : cp)));
  const setCpReq = (i: number, cohortId: string, value: number) =>
    setCheckpoints((cps) => cps.map((cp, idx) => (idx === i ? { ...cp, requirements: { ...cp.requirements, [cohortId]: value } } : cp)));
  const addCheckpoint = () => {
    const reqs: Record<string, number> = {};
    cohorts.forEach((c) => (reqs[c.id] = 0));
    setCheckpoints([...checkpoints, { name: `CP${checkpoints.length + 1}`, date: config.program_start, requirements: reqs }]);
  };
  const removeCheckpoint = (i: number) => setCheckpoints(checkpoints.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig({
        program_name: programName,
        program_start: programStart,
        cohorts,
        checkpoints,
        class_labels: classLabels,
        grad_year_field: gradYearField,
        class_field: classField,
        manual_seniors: manualSeniors,
        manual_classes: manualClasses,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Program">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Program name"><input value={programName} onChange={(e) => setProgramName(e.target.value)} /></Field>
          <Field label="Program start"><input type="date" value={programStart} onChange={(e) => setProgramStart(e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-[11px]" style={SUBTLE}>
          The last checkpoint's date is your program end. "Today's pace" is interpolated between the program start and your checkpoints.
        </p>
      </Card>

      <Card title="Cohorts (requirement tiers)">
        <div className="space-y-2">
          {cohorts.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_auto_auto] items-center gap-2">
              <input value={c.label} onChange={(e) => setCohort(i, { label: e.target.value })} placeholder="Label" />
              <input
                value={c.grad_years.join(", ")}
                onChange={(e) => setCohort(i, { grad_years: e.target.value.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => !isNaN(x)) })}
                placeholder="Graduation years e.g. 2026, 2027"
              />
              <button
                type="button"
                onClick={() => setDefault(i)}
                title="The default cohort is used for any member whose graduation year doesn't match another cohort"
                className="rounded-lg px-3 py-2 text-[11px] font-medium transition-colors"
                style={{
                  background: c.is_default ? "#3498db22" : "var(--surface-2)",
                  border: c.is_default ? "1px solid #3498db66" : "1px solid var(--border-3)",
                  color: c.is_default ? "#7cc0e8" : "var(--text-muted)",
                }}
              >
                {c.is_default ? "✓ default" : "set default"}
              </button>
              <button onClick={() => removeCohort(i)} disabled={cohorts.length <= 1} className="rounded-lg p-2 disabled:opacity-30" style={{ background: "#e74c3c14", color: "#e74c3c" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
        <GhostButton onClick={addCohort} className="mt-3"><span className="flex items-center gap-1"><Plus size={13} /> Add cohort</span></GhostButton>
        <p className="mt-3 text-[11px]" style={SUBTLE}>
          A member falls into the first cohort matching their graduation year; everyone else uses the <strong>default</strong> cohort.
        </p>
      </Card>

      <Card title="Checkpoints">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wide" style={SUBTLE}>Name</th>
                <th className="px-2 py-2 text-left text-[11px] uppercase tracking-wide" style={SUBTLE}>Date</th>
                {cohorts.map((c) => (
                  <th key={c.id} className="px-2 py-2 text-left text-[11px] uppercase tracking-wide" style={SUBTLE}>{c.label} hrs</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {checkpoints.map((cp, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-2 py-1.5"><input value={cp.name} onChange={(e) => setCp(i, { name: e.target.value })} style={{ width: 80 }} /></td>
                  <td className="px-2 py-1.5"><input type="date" value={cp.date} onChange={(e) => setCp(i, { date: e.target.value })} style={{ width: 150 }} /></td>
                  {cohorts.map((c) => (
                    <td key={c.id} className="px-2 py-1.5">
                      <input
                        type="number" step="0.01" style={{ width: 90 }}
                        value={cp.requirements[c.id] ?? 0}
                        onChange={(e) => setCpReq(i, c.id, parseFloat(e.target.value) || 0)}
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <button onClick={() => removeCheckpoint(i)} className="rounded-lg p-2" style={{ background: "#e74c3c14", color: "#e74c3c" }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <GhostButton onClick={addCheckpoint} className="mt-3"><span className="flex items-center gap-1"><Plus size={13} /> Add checkpoint</span></GhostButton>
      </Card>

      <ClassLabelsCard classLabels={classLabels} setClassLabels={setClassLabels} />

      <SeniorFallbackCard
        gradYearField={gradYearField}
        setGradYearField={setGradYearField}
        classLabels={classLabels}
        classField={classField}
        setClassField={setClassField}
        manualSeniors={manualSeniors}
        setManualSeniors={setManualSeniors}
        manualClasses={manualClasses}
        setManualClasses={setManualClasses}
        seniorCohortLabel={cohorts.find((c) => c.label.toLowerCase().includes("senior"))?.label
          ?? cohorts.find((c) => !c.is_default)?.label
          ?? "senior"}
      />

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & reload"}</PrimaryButton>
      </div>
    </div>
  );
}

function ClassLabelsCard({ classLabels, setClassLabels }: { classLabels: Record<string, string>; setClassLabels: (v: Record<string, string>) => void }) {
  const [rows, setRows] = useState(Object.entries(classLabels));
  useEffect(() => { setClassLabels(Object.fromEntries(rows.filter(([y]) => y.trim()))); }, [rows]); // eslint-disable-line
  return (
    <Card title="Class labels (display grouping)">
      <p className="mb-3 text-[11px]" style={SUBTLE}>Maps graduation year → the label shown in Members/Overview grouping (independent of requirement cohorts).</p>
      <div className="space-y-2">
        {rows.map(([year, label], i) => (
          <div key={i} className="grid grid-cols-[120px_1fr_auto] items-center gap-2">
            <input value={year} onChange={(e) => setRows(rows.map((r, idx) => idx === i ? [e.target.value, r[1]] : r))} placeholder="Year" />
            <input value={label} onChange={(e) => setRows(rows.map((r, idx) => idx === i ? [r[0], e.target.value] : r))} placeholder="Label" />
            <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="rounded-lg p-2" style={{ background: "#e74c3c14", color: "#e74c3c" }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <GhostButton onClick={() => setRows([...rows, ["", ""]])} className="mt-3"><span className="flex items-center gap-1"><Plus size={13} /> Add</span></GhostButton>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Senior detection fallback (class field selector + manual senior picker)
// --------------------------------------------------------------------------- //
function SeniorFallbackCard({
  gradYearField,
  setGradYearField,
  classLabels,
  classField,
  setClassField,
  manualSeniors,
  setManualSeniors,
  manualClasses,
  setManualClasses,
  seniorCohortLabel,
}: {
  gradYearField: string;
  setGradYearField: (v: string) => void;
  classLabels: Record<string, string>;
  classField: string;
  setClassField: (v: string) => void;
  manualSeniors: string[];
  setManualSeniors: (v: string[]) => void;
  manualClasses: Record<string, string>;
  setManualClasses: (v: Record<string, string>) => void;
  seniorCohortLabel: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");
  const columns = useAsyncData(() => api.getDataColumns(), [], true);
  const members = useAsyncData(() => api.getMembers(), [showPicker], showPicker);

  const userColumns = (columns.data?.users ?? []) as string[];
  const gradOptions = Array.from(new Set([gradYearField, ...userColumns].filter(Boolean)));
  const fieldOptions = Array.from(new Set([classField, ...userColumns].filter(Boolean)));
  const memberRows = (members.data ?? []) as unknown as Array<{ email: string; display_name: string; class_label: string }>;
  const selected = new Set(manualSeniors.map((e) => e.toLowerCase()));
  const filteredMembers = memberRows.filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });
  const labelRows = Object.entries(classLabels).sort((a, b) => a[0].localeCompare(b[0]));

  const toggleSenior = (email: string) => {
    const lower = email.toLowerCase();
    if (selected.has(lower)) setManualSeniors(manualSeniors.filter((e) => e.toLowerCase() !== lower));
    else setManualSeniors([...manualSeniors, lower]);
  };

  // Distinct class options for the manual override dropdown (mapped labels +
  // anything already assigned, so existing overrides always show).
  const classOptions = Array.from(new Set([...Object.values(classLabels), ...Object.values(manualClasses)])).filter(Boolean);
  const overrideCount = Object.keys(manualClasses).length;
  const setMemberClass = (email: string, label: string) => {
    const lower = email.toLowerCase();
    const updated = { ...manualClasses };
    if (label) updated[lower] = label;
    else delete updated[lower];
    setManualClasses(updated);
  };

  return (
    <Card title="Class & senior detection">
      <p className="mb-3 text-[11px]" style={SUBTLE}>
        Pick the column that holds each member's <strong>graduation year</strong>; we read its first four digits
        (so "Spring 2029" → 2029) and map that to a class with the table below (2029 → Freshman, …). If your export
        has no graduation year, fall back to a text class column, or use the manual picker below to mark seniors and
        assign classes (Freshman, Sophomore, …) by hand. Members checked as senior are forced into the
        <strong> {seniorCohortLabel}</strong> requirement tier; a manually assigned class overrides auto-detection
        everywhere it's displayed.
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Graduation year column">
          <select value={gradYearField} onChange={(e) => setGradYearField(e.target.value)}>
            <option value="">(none)</option>
            {gradOptions.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </Field>
        <Field label="Class / year column (used when graduation year is missing)">
          <select value={classField} onChange={(e) => setClassField(e.target.value)}>
            <option value="">(none)</option>
            {fieldOptions.map((col) => (
              <option key={col} value={col}>{col}</option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <div className={LABEL} style={{ color: "var(--text-faint)" }}>Graduation year → class</div>
        {labelRows.length === 0 ? (
          <div className="text-[11px]" style={SUBTLE}>No mappings yet — add them in “Class labels” above.</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {labelRows.map(([year, label]) => (
              <span key={year} className="rounded-full px-2.5 py-1 text-[11px]" style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}>
                {year} → {label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 text-[11px]" style={SUBTLE}>
        {manualSeniors.length === 0 && overrideCount === 0
          ? "No manual overrides set — auto-detection is in use."
          : [
              manualSeniors.length > 0 ? `${manualSeniors.length} member${manualSeniors.length === 1 ? "" : "s"} marked senior manually` : "",
              overrideCount > 0 ? `${overrideCount} manual class override${overrideCount === 1 ? "" : "s"}` : "",
            ].filter(Boolean).join(" · ") + "."}
      </div>

      <button
        type="button"
        onClick={() => setShowPicker((v) => !v)}
        className="mt-3 rounded-lg px-3 py-2 text-[12px] font-medium"
        style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}
        aria-expanded={showPicker}
      >
        {showPicker ? "Hide manual picker" : "Pick seniors / assign classes manually…"}
      </button>

      {showPicker && (
        <div className="mt-3 rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search members…"
            aria-label="Search members"
            className="mb-3"
          />
          {members.loading ? (
            <div className="text-[11px]" style={SUBTLE}>Loading members…</div>
          ) : memberRows.length === 0 ? (
            <div className="text-[11px]" style={SUBTLE}>No members loaded yet. Upload a users CSV first (Settings → Data).</div>
          ) : (
            <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
              <div className="flex items-center gap-2.5 px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wide" style={SUBTLE}>
                <span style={{ width: 15, flexShrink: 0 }} title="Senior tier">Sr</span>
                <span className="min-w-0 flex-1">Member</span>
                <span className="shrink-0">Class</span>
              </div>
              {filteredMembers.map((m) => {
                const on = selected.has(m.email.toLowerCase());
                const override = manualClasses[m.email.toLowerCase()] ?? "";
                return (
                  <div
                    key={m.email}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                    style={{ background: on || override ? "#3498db14" : "transparent" }}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleSenior(m.email)}
                      title={`Force into the ${seniorCohortLabel} requirement tier`}
                      style={{ width: 15, height: 15, flexShrink: 0, cursor: "pointer" }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--text)" }}>{m.display_name}</span>
                    <select
                      value={override}
                      onChange={(e) => setMemberClass(m.email, e.target.value)}
                      title="Manually assign this member's class"
                      className="shrink-0 text-[11px]"
                      style={{ width: 130 }}
                    >
                      <option value="">auto: {m.class_label || "—"}</option>
                      {classOptions.map((label) => (
                        <option key={label} value={label}>{label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
              {filteredMembers.length === 0 && (
                <div className="px-2 py-3 text-[11px]" style={SUBTLE}>No members match "{search}".</div>
              )}
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-[11px]" style={SUBTLE}>Changes apply when you hit <strong>Save &amp; reload</strong> below.</p>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Reflections
// --------------------------------------------------------------------------- //
function ReflectionsSection({ config, saveConfig }: { config: AppConfig; saveConfig: (p: Partial<AppConfig>) => Promise<unknown> }) {
  const [fields, setFields] = useState(config.reflection.fields.join("\n"));
  const [emptyValues, setEmptyValues] = useState(config.reflection.empty_values.join(", "));
  const [rule, setRule] = useState(config.reflection.blank_rule);
  const [saving, setSaving] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const columns = useAsyncData(() => api.getDataColumns(), [showPicker], showPicker);

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig({
        reflection: {
          fields: fields.split("\n").map((f) => f.trim()).filter(Boolean),
          empty_values: emptyValues.split(",").map((v) => v.trim()).filter(Boolean),
          blank_rule: rule,
        },
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldList = fields.split("\n").map((f) => f.trim()).filter(Boolean);
  const toggleField = (col: string) => {
    const set = new Set(fieldList);
    set.has(col) ? set.delete(col) : set.add(col);
    setFields(Array.from(set).join("\n"));
  };
  const impactColumns = (columns.data?.impacts ?? []) as string[];

  return (
    <Card title="Reflection tracking">
      <p className="mb-4 text-[11px]" style={SUBTLE}>
        Choose which impact fields count as a "reflection". Leave empty to turn reflection tracking off entirely.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Reflection fields (one per line)">
          <textarea value={fields} onChange={(e) => setFields(e.target.value)} rows={4} style={{ width: "100%" }} placeholder="Review/Reflection" />
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="mt-2 rounded-lg px-3 py-1.5 text-[11px] font-medium"
            style={{ background: "var(--surface-3)", border: "1px solid var(--border-3)", color: "var(--text-2)" }}
            aria-expanded={showPicker}
          >
            {showPicker ? "Hide CSV fields" : "Pick fields from your CSV…"}
          </button>
          {showPicker && (
            <div className="mt-2 rounded-lg p-3" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
              {columns.loading ? (
                <div className="text-[11px]" style={SUBTLE}>Loading columns…</div>
              ) : impactColumns.length === 0 ? (
                <div className="text-[11px]" style={SUBTLE}>No impact columns found. Upload an impacts CSV first (Settings → Data).</div>
              ) : (
                <>
                  <div className="mb-2 text-[11px]" style={SUBTLE}>Tap a column from your impacts export to toggle it as a reflection field.</div>
                  <div className="flex flex-wrap gap-1.5">
                    {impactColumns.map((col) => {
                      const on = fieldList.includes(col);
                      return (
                        <button
                          key={col}
                          type="button"
                          onClick={() => toggleField(col)}
                          aria-pressed={on}
                          className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
                          style={{
                            background: on ? "#3498db22" : "var(--surface)",
                            border: on ? "1px solid #3498db66" : "1px solid var(--border-3)",
                            color: on ? "#7cc0e8" : "var(--text-2)",
                          }}
                        >
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
        <div className="space-y-4">
          <Field label="Values that count as empty (comma-separated)">
            <input value={emptyValues} onChange={(e) => setEmptyValues(e.target.value)} placeholder="n/a, na, none, nil" />
          </Field>
          <Field label="Mark a row blank when…">
            <select value={rule} onChange={(e) => setRule(e.target.value as "all" | "any")}>
              <option value="all">all selected fields are empty</option>
              <option value="any">any selected field is empty</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-4 text-[11px]" style={SUBTLE}>
        {fieldList.length === 0 ? "Reflection tracking is OFF." : `Tracking: ${fieldList.join(", ")}`}
      </div>
      <div className="mt-4"><PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & reload"}</PrimaryButton></div>
    </Card>
  );
}

// --------------------------------------------------------------------------- //
// Roster export
// --------------------------------------------------------------------------- //
function RosterSection({ config, saveConfig, loaded }: { config: AppConfig; saveConfig: (p: Partial<AppConfig>) => Promise<unknown>; loaded: boolean }) {
  const [roster, setRoster] = useState(config.roster_order.join("\n"));
  const [saving, setSaving] = useState(false);
  const status = useAsyncData(() => api.getRosterStatus(), [config.roster_order.join("|")], loaded && config.roster_order.length > 0);

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig({ roster_order: roster.split("\n").map((line) => line.replace(/\r$/, "")) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Roster order for exports">
        <p className="mb-4 text-[11px]" style={SUBTLE}>
          Paste your spreadsheet's name column — one name per line, blank lines kept as blank rows. The Export page emits
          hours in this exact order so you can paste a single column straight into your sheet.
        </p>
        <textarea value={roster} onChange={(e) => setRoster(e.target.value)} rows={12} style={{ width: "100%", fontFamily: "monospace" }} placeholder={"Maya Chen\nJordan Rivera\n\nAlex Kim"} />
        <div className="mt-4"><PrimaryButton onClick={save} disabled={saving}>{saving ? "Saving…" : "Save roster"}</PrimaryButton></div>
      </Card>

      {status.data && (
        <Card title="Match preview">
          <div className="mb-3 flex gap-4 text-[12px]">
            <span style={{ color: "#27ae60" }}>{status.data.matched} matched</span>
            <span style={{ color: "#e74c3c" }}>{status.data.unmatched} unmatched</span>
            <span style={SUBTLE}>{status.data.total} names</span>
          </div>
          {status.data.unmatched > 0 && (
            <div className="text-[11px]" style={{ color: "var(--text-2)" }}>
              Unmatched: {(status.data.rows as Array<Record<string, unknown>>).filter((r) => !r.is_blank && !r.matched).map((r) => String(r.name)).join(", ") || "—"}
              <div className="mt-1" style={SUBTLE}>Fix unmatched names by editing them to match the member's display name, or add a name mapping in the config.</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Messages (per-status outreach templates)
// --------------------------------------------------------------------------- //
const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th"];
const ORDINAL_WORDS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth"];

const MESSAGE_STATUSES: Status[] = ["Red", "Blue", "Yellow", "Green"];

function formatRunDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function MessagesSection({ config, saveConfig }: { config: AppConfig; saveConfig: (p: Partial<AppConfig>) => Promise<unknown> }) {
  const defaults = useAsyncData(() => api.getTemplateDefaults(), [], true);
  const [drafts, setDrafts] = useState<Record<string, string>>(config.message_templates ?? {});
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const dirty = JSON.stringify(drafts) !== JSON.stringify(config.message_templates ?? {});

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig({ message_templates: drafts });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const resetOne = (status: Status) => {
    const def = defaults.data?.templates?.[status];
    if (def === undefined) return;
    setDrafts((d) => ({ ...d, [status]: def }));
  };

  // Determine the active checkpoint: first upcoming (date >= today), else the first checkpoint.
  const sortedCheckpoints = useMemo(
    () => [...config.checkpoints].sort((a, b) => a.date.localeCompare(b.date)),
    [config.checkpoints],
  );
  const today = new Date().toISOString().slice(0, 10);
  const activeIndex = useMemo(() => {
    const idx = sortedCheckpoints.findIndex((cp) => cp.date >= today);
    return idx === -1 ? Math.max(sortedCheckpoints.length - 1, 0) : idx;
  }, [sortedCheckpoints, today]);
  const activeCheckpoint = sortedCheckpoints[activeIndex];

  // Default cohort for the goal example.
  const defaultCohort = config.cohorts.find((c) => c.is_default) ?? config.cohorts[0];
  const goalValue = activeCheckpoint ? (activeCheckpoint.requirements[defaultCohort?.id ?? ""] ?? Object.values(activeCheckpoint.requirements)[0] ?? 0) : 0;
  const hoursValue = Math.round(goalValue * 0.6 * 10) / 10;

  const checkpointExample: CheckpointExample = {
    ordinal: ORDINALS[activeIndex] ?? `${activeIndex + 1}th`,
    ordinal_word: ORDINAL_WORDS[activeIndex] ?? `${activeIndex + 1}th`,
    checkpoint_number: String(activeIndex + 1),
    checkpoint_name: activeCheckpoint?.name ?? "—",
  };

  const exampleValues: Record<TemplateToken, string> = {
    hours: hoursValue.toFixed(1),
    goal: goalValue % 1 === 0 ? String(goalValue) : goalValue.toFixed(1),
    run_date: activeCheckpoint ? formatRunDate(activeCheckpoint.date) : "—",
    ordinal: checkpointExample.ordinal,
    ordinal_word: checkpointExample.ordinal_word,
    checkpoint_number: checkpointExample.checkpoint_number,
    checkpoint_name: checkpointExample.checkpoint_name,
  };

  const renderPreview = (template: string) =>
    template.replace(/\{(\w+)\}/g, (full, token) => (token in exampleValues ? exampleValues[token as TemplateToken] : full));

  return (
    <div className="space-y-5">
      <Card>
        <p className="text-[12px]" style={SUBTLE}>
          These are the draft messages used on the Communication Prep page. Variables (shown as colored pills) are
          filled in per member when the outreach queue is built — click a variable in the toolbar below an editor
          to insert it, and click the amber checkpoint-language pills to switch between phrasings.
        </p>
      </Card>

      {MESSAGE_STATUSES.map((status) => (
        <MessageStatusCard
          key={status}
          status={status}
          value={drafts[status] ?? ""}
          onChange={(v) => setDrafts((d) => ({ ...d, [status]: v }))}
          onReset={() => resetOne(status)}
          variables={defaults.data?.variables ?? []}
          checkpointExample={checkpointExample}
          preview={renderPreview(drafts[status] ?? "")}
        />
      ))}

      <div className="flex items-center gap-3">
        <PrimaryButton onClick={save} disabled={saving || !dirty}>{saving ? "Saving…" : "Save messages"}</PrimaryButton>
        {savedFlash && (
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "#27ae60" }}>
            <Check size={14} /> Saved
          </div>
        )}
      </div>
    </div>
  );
}

function MessageStatusCard({
  status,
  value,
  onChange,
  onReset,
  variables,
  checkpointExample,
  preview,
}: {
  status: Status;
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  variables: Array<{ token: string; label: string; description: string; example: string }>;
  checkpointExample: CheckpointExample;
  preview: string;
}) {
  const editorRef = useRef<TemplateEditorHandle>(null);
  const color = STATUS_COLORS[status];

  return (
    <div className="rounded-xl p-5" style={CARD}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{status}</span>
        </div>
        <button type="button" onClick={onReset} className="text-[11px] font-medium underline" style={{ color: "var(--text-muted)" }}>
          Reset to default
        </button>
      </div>

      <TemplateEditor ref={editorRef} value={value} onChange={onChange} checkpointExample={checkpointExample} />

      <div className="mt-3 flex flex-wrap gap-1.5">
        {variables.map((v) => {
          const tokenColor = v.token === "hours" ? "#27ae60"
            : v.token === "goal" ? "#3498db"
            : v.token === "run_date" ? "#9b59b6"
            : "#e67e22";
          return (
            <button
              key={v.token}
              type="button"
              title={v.description}
              onClick={() => editorRef.current?.insertToken(v.token as TemplateToken)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
              style={{ background: `${tokenColor}18`, color: tokenColor, border: `1px solid ${tokenColor}40` }}
            >
              + {v.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <div className={LABEL} style={{ color: "var(--text-faint)" }}>Preview</div>
        <div
          className="rounded-lg p-3 text-[12px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)", whiteSpace: "pre-wrap" }}
        >
          {preview || <span style={{ color: "var(--text-faint)" }}>—</span>}
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Exemptions (existing behavior, now its own tab)
// --------------------------------------------------------------------------- //
function ExemptionsSection({
  dataStatus,
  onDataStatusChange,
}: {
  dataStatus: DataStatus | null;
  onDataStatusChange: (status: DataStatus) => void;
}) {
  const activeCheckpoint = dataStatus?.active_checkpoint ?? "CP3";
  const exemptions = useAsyncData(() => api.getExemptions(), [activeCheckpoint], true);
  const members = useAsyncData(() => api.getMembers(), [activeCheckpoint], true);
  const [selectedEmail, setSelectedEmail] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const rows = (exemptions.data ?? []) as unknown as ExemptionRow[];
  const memberRows = (members.data ?? []) as unknown as MemberOption[];
  const exemptEmails = new Set(rows.map((row) => row.email));
  const addableMembers = useMemo(
    () => memberRows.filter((member) => !exemptEmails.has(member.email)),
    [memberRows, exemptEmails],
  );

  const refreshAll = async () => {
    exemptions.setData(await api.getExemptions());
    onDataStatusChange(await api.reloadData(activeCheckpoint));
  };

  const addExemption = async () => {
    const member = addableMembers.find((item) => item.email === selectedEmail);
    if (!member) return;
    setSaving(true);
    try {
      await api.addExemption({ email: member.email, name: member.display_name, reason });
      setSelectedEmail("");
      setReason("");
      await refreshAll();
    } finally {
      setSaving(false);
    }
  };

  const removeExemption = async (email: string) => {
    setSaving(true);
    try {
      await api.deleteExemption(email);
      await refreshAll();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card title="Add exemption">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
          <select value={selectedEmail} onChange={(e) => setSelectedEmail(e.target.value)}>
            <option value="">Select a member…</option>
            {addableMembers.map((member) => (
              <option key={member.email} value={member.email}>{member.display_name} ({member.email})</option>
            ))}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for exemption" />
          <PrimaryButton onClick={addExemption} disabled={!selectedEmail || saving}>Add</PrimaryButton>
        </div>
      </Card>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
              {["Name", "Email", "Reason", "Action"].map((h, i) => (
                <th key={h} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[0.12em] ${i === 3 ? "text-right" : "text-left"}`} style={SUBTLE}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.email} style={{ background: index % 2 === 0 ? "var(--surface)" : "var(--row-alt)", borderBottom: "1px solid var(--bg-1)" }}>
                <td className="px-4 py-3" style={{ color: "var(--text)" }}>{row.name || "—"}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-3)" }}>{row.email}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-2)" }}>{row.reason || "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => removeExemption(row.email)} disabled={saving} className="rounded-lg px-3 py-1.5 text-[11px] font-medium disabled:opacity-40" style={{ background: "#e74c3c18", border: "1px solid #e74c3c30", color: "#e74c3c" }}>Remove</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-[12px]" style={SUBTLE}>No exemptions configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Help
// --------------------------------------------------------------------------- //
function HelpSection({ onOpenWalkthrough }: { onOpenWalkthrough?: () => void }) {
  return (
    <Card title="Help & walkthrough">
      <p className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Replay the guided walkthrough covering data sources, GivePulse setup, checkpoints, cohorts, reflections, and exports.
      </p>
      <div className="mt-4"><PrimaryButton onClick={() => onOpenWalkthrough?.()}>Replay walkthrough</PrimaryButton></div>
    </Card>
  );
}
