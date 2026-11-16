/** Download actions shared by the reports list and the report view. */
import { brandConfig } from "../../../hooks/useBrandConfig";
import { downloadCsv, toCsv } from "./format";
import { reportCsv, type ReportData } from "./reportData";

/** Where the pre-rendered PDF for a report lives (frontend/public/reports/<city id>/). */
export function pdfUrl(id: string): string {
  return `/reports/${brandConfig.id}/${id}.pdf`;
}

function todayStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 0);
}

/**
 * Download the pre-rendered PDF. Returns false when this deployment has no
 * PDF for the report (another city, or not rendered yet), so the caller can
 * fall back to printing the live view.
 */
export async function downloadPdf(id: string): Promise<boolean> {
  let blob: Blob;
  try {
    // GET, not HEAD: the API's SPA route only answers GET. A missing file
    // under /reports/ is a 404 (backend/app/spa.py), never index.html.
    const res = await fetch(pdfUrl(id), { cache: "no-cache" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("pdf")) return false;
    blob = await res.blob();
  } catch {
    return false;
  }
  saveBlob(blob, `${brandConfig.id}-${id}.pdf`);
  return true;
}

/** Build and download the CSV for a report. Returns false if it has none. */
export function downloadReportCsv(id: string, data: ReportData): boolean {
  const table = reportCsv(id, data);
  if (!table) return false;
  downloadCsv(`${brandConfig.id}-${id}-${todayStamp()}.csv`, toCsv(table));
  return true;
}
