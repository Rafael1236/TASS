import type { ReportData } from "./conversation";
import { OMITIR_VALUE } from "./conversation";

interface PhotoPayload {
  base64DataUrl: string;
}

interface TecnicoPayload {
  nombre: string;
  es_subcontrato: boolean;
}

interface RepuestoPayload {
  cantidad?: string;
  descripcion: string;
}

export interface SaveReportResponse {
  ok: true;
  reporte_id: string | number;
  numero_reporte: string | number;
  cliente_id: string | number;
  fotos: string[];
}

function getApiBase(): string {
  // Must use dot-notation — Metro/Babel only statically replaces EXPO_PUBLIC_*
  // when accessed as process.env.EXPO_PUBLIC_<NAME>, never bracket notation.
  // eslint-disable-next-line dot-notation
  const domain: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!domain) return "/api";
  return `https://${domain}/api`;
}

export function getApiBaseUrl(): string {
  return getApiBase();
}

async function uriToDataUrl(uri: string): Promise<string | null> {
  try {
    if (uri.startsWith("data:")) return uri;
    const res = await fetch(uri);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = reader.result;
        resolve(typeof r === "string" ? r : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Concept A: TAS auxiliary technicians — always es_subcontrato: false.
 * These are internal colleagues; subcontract headcount is tracked separately.
 */
function parseTecnicos(raw: string | undefined): TecnicoPayload[] {
  if (!raw || !raw.trim()) return [];
  if (raw.trim().toLowerCase() === OMITIR_VALUE) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((nombre) => ({ nombre, es_subcontrato: false }));
}

function parseRepuestos(raw: string | undefined): RepuestoPayload[] {
  if (!raw || !raw.trim()) return [];
  if (raw.trim().toLowerCase() === OMITIR_VALUE) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // Patterns like "2 x Cable UTP cat6"
      const m = line.match(/^(\d+(?:\.\d+)?)\s*(?:x|X|×|-)\s*(.+)$/);
      if (m) {
        return { cantidad: m[1], descripcion: (m[2] ?? "").trim() };
      }
      return { descripcion: line };
    });
}

/** Converts a ReportData time field to a clean string for the API. */
function cleanTime(val: string | undefined): string {
  if (!val || val.trim() === OMITIR_VALUE) return "";
  return val.trim();
}

export async function saveReportToBackend(
  data: ReportData,
  firmaDataUrl?: string,
): Promise<SaveReportResponse> {
  const photos: PhotoPayload[] = [];
  for (const uri of data.fotos ?? []) {
    const dataUrl = await uriToDataUrl(uri);
    if (dataUrl) photos.push({ base64DataUrl: dataUrl });
  }

  // Concept B: subcontract headcount (integer, no names)
  const cantidadRaw = (data.cantidad_subcontrato ?? "").trim();
  const cantidadNum = parseInt(cantidadRaw, 10);

  const body: Record<string, unknown> = {
    cliente_nombre: (data.cliente_nombre ?? "").trim(),
    tecnico_nombre: data.tecnico_nombre ?? "",
    numero_llamada: data.numero_llamada ?? "",
    numero_proyecto: data.numero_proyecto ?? "",
    tipo_servicio: data.tipo_servicio ?? "",
    trabajo_realizado: data.trabajo_realizado ?? "",
    hora_entrada: cleanTime(data.hora_entrada),
    hora_salida: cleanTime(data.hora_salida),
    estado_servicio: data.estado_servicio ?? "",
    hay_cotizacion: data.hay_cotizacion === "Sí",
    descripcion_cotizacion: data.descripcion_cotizacion ?? "",
    observaciones: data.observaciones ?? "",
    es_subcontrato: data.hay_subcontrato === "Sí",
    cantidad_subcontrato: isNaN(cantidadNum) ? null : cantidadNum,
    placa_vehiculo: (data.placa_vehiculo ?? "").trim().toUpperCase() || undefined,
    tecnicos: parseTecnicos(data.reporte_tecnicos),
    repuestos: parseRepuestos(data.reporte_repuestos),
    photos,
  };

  if (firmaDataUrl) {
    body["firma_data_url"] = firmaDataUrl;
  }

  const url = `${getApiBase()}/reports`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: string };
      detail = j.error ?? "";
    } catch {}
    throw new Error(detail || `HTTP ${res.status}`);
  }

  return (await res.json()) as SaveReportResponse;
}
