import { api } from "../api/client";
import type { AppConfig } from "../types";

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** Export the settings JSON. In the desktop app the backend writes it straight
 * to ~/Downloads (the embedded webview can't do blob downloads) and the saved
 * path is returned; in a browser this falls back to a normal download and
 * returns null. */
export async function exportSettingsFile(config: AppConfig): Promise<string | null> {
  try {
    const res = await api.exportSettingsFile();
    if (res.saved && res.path) return res.path;
  } catch {
    // fall through to a plain browser download
  }
  const name = (config.program_name || "bonner").toLowerCase().replace(/\s+/g, "-");
  downloadJson(`${name}-settings.json`, config);
  return null;
}
