import type {
  AppConfig,
  CheckpointsResponse,
  DataStatus,
  InsightsResponse,
  MemberRow,
  OverviewResponse,
  ReflectionMember,
} from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  loadData: (checkpoint?: string) =>
    request<DataStatus>("/api/data/load", {
      method: "POST",
      body: JSON.stringify(checkpoint ? { checkpoint } : {}),
    }),
  reloadData: (checkpoint?: string) =>
    request<DataStatus>("/api/data/reload", {
      method: "POST",
      body: JSON.stringify(checkpoint ? { checkpoint } : {}),
    }),
  getStatus: () => request<DataStatus>("/api/data/status"),
  getDataColumns: () => request<{ users: string[]; impacts: string[] }>("/api/data/columns"),
  getCheckpoints: () => request<CheckpointsResponse>("/api/checkpoints"),
  setCheckpoint: (checkpoint: string) =>
    request<DataStatus>("/api/checkpoints/active", {
      method: "PUT",
      body: JSON.stringify({ checkpoint }),
    }),
  getOverview: () => request<OverviewResponse>("/api/overview"),
  getOverviewDrilldown: (kind: string, className?: string) =>
    request<Record<string, unknown>>(
      `/api/overview/drilldown?kind=${encodeURIComponent(kind)}${className ? `&class_name=${encodeURIComponent(className)}` : ""}`,
    ),
  getClassDistribution: () => request<Array<Record<string, string | number>>>("/api/overview/class-distribution"),
  getInsights: () => request<InsightsResponse>("/api/insights"),
  getMembers: (params = "") => request<MemberRow[]>(`/api/members${params}`),
  getMemberProfile: (email: string) => request<Record<string, unknown>>(`/api/members/${encodeURIComponent(email)}/profile`),
  getPartnersPending: () => request<Array<Record<string, unknown>>>("/api/partners/pending"),
  getPartnerPendingDetail: (partner: string) =>
    request<Record<string, unknown>>(`/api/partners/pending-detail?partner=${encodeURIComponent(partner)}`),
  getPartnersEngagement: () => request<Array<Record<string, unknown>>>("/api/partners/engagement"),
  getReflections: () => request<{ summary: Record<string, number>; members: ReflectionMember[] }>("/api/reflections"),
  getCritical: () => request<Array<Record<string, unknown>>>("/api/critical"),
  updateSupport: (email: string, sent: boolean, notes: string) =>
    request("/api/critical/" + encodeURIComponent(email) + "/support", {
      method: "PUT",
      body: JSON.stringify({ sent, notes }),
    }),
  resetCritical: (emails: string[]) =>
    request("/api/critical/reset", {
      method: "POST",
      body: JSON.stringify({ emails }),
    }),
  getDateRange: (start: string, end: string) =>
    request<Array<Record<string, unknown>>>(`/api/daterange?start=${start}&end=${end}`),
  getCheckpointExport: (cp: string) =>
    request<{ rows: Array<Record<string, unknown>>; clipboard: string }>(`/api/excel/checkpoint-export?cp=${cp}`),
  getBannerExport: (start: string, end: string) =>
    request<{ rows: Array<Record<string, unknown>>; clipboard: string }>(`/api/excel/banner-export?start=${start}&end=${end}`),
  getExemptions: () => request<Array<Record<string, unknown>>>("/api/exemptions"),
  addExemption: (payload: { email: string; name: string; reason: string }) =>
    request("/api/exemptions", { method: "POST", body: JSON.stringify(payload) }),
  deleteExemption: (email: string) => request("/api/exemptions/" + encodeURIComponent(email), { method: "DELETE" }),
  getSlackQueue: (checkpoint: string, statuses: string[]) =>
    request<Array<Record<string, unknown>>>(`/api/slack/queue?checkpoint=${checkpoint}&statuses=${statuses.join(",")}`),
  updateSlackMessage: (email: string, message: string) =>
    request("/api/slack/queue/" + encodeURIComponent(email) + "/message", {
      method: "PUT",
      body: JSON.stringify({ message }),
    }),

  // ---- config ----
  getConfig: () => request<AppConfig>("/api/config"),
  updateConfig: (patch: Partial<AppConfig>) =>
    request<{ saved: boolean; config: AppConfig; data?: DataStatus; load_error?: string }>("/api/config", {
      method: "PUT",
      body: JSON.stringify(patch),
    }),
  exportSettingsFile: () =>
    request<{ saved: boolean; path?: string }>("/api/config/export-file", { method: "POST" }),
  resetConfig: () =>
    request<{ saved: boolean; config: AppConfig }>("/api/config/reset", { method: "POST" }),
  importConfig: (config: Partial<AppConfig>) =>
    request<{ saved: boolean; config: AppConfig; data?: DataStatus; load_error?: string }>("/api/config/import", {
      method: "POST",
      body: JSON.stringify(config),
    }),
  completeOnboarding: () =>
    request<{ onboarding_complete: boolean }>("/api/config/onboarding-complete", { method: "POST" }),
  getTemplateDefaults: () =>
    request<{ templates: Record<string, string>; variables: Array<{ token: string; label: string; description: string; example: string }> }>(
      "/api/config/template-defaults",
    ),

  // ---- roster export ----
  getRosterStatus: () =>
    request<{ rows: Array<Record<string, unknown>>; matched: number; unmatched: number; total: number }>(
      "/api/excel/roster-status",
    ),

  // ---- csv upload ----
  uploadCsv: async (kind: "users" | "impacts", file: File) => {
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch(`/api/data/upload?kind=${kind}`, { method: "POST", body: form });
    if (!resp.ok) throw new Error((await resp.text()) || `Upload failed: ${resp.status}`);
    return resp.json() as Promise<{ saved: boolean; filename: string; kind: string }>;
  },
};
