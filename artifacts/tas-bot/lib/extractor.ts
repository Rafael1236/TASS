import type { ReportData } from "./conversation";
import { parseTimeStr } from "./conversation";

/**
 * Calls the API server's /api/extract endpoint, which forwards the
 * conversation transcript to Claude and returns structured JSON.
 * The Anthropic API key is server-side only.
 */

interface ClaudeMaterial {
  cantidad?: string;
  descripcion?: string;
}

interface ClaudeTecnico {
  nombre?: string;
  es_subcontrato?: boolean;
}

interface ClaudeResponse {
  tecnico_nombre?: string;
  cliente_nombre?: string;
  numero_llamada?: string;
  numero_proyecto?: string;
  tipo_servicio?: string[];
  trabajo_realizado?: string;
  reporte_repuestos?: ClaudeMaterial[];
  reporte_tecnicos?: ClaudeTecnico[];
  hora_entrada?: string;
  hora_salida?: string;
  estado_servicio?: string;
  hay_cotizacion?: boolean;
  descripcion_cotizacion?: string;
  observaciones?: string;
  hay_tecnicos_auxiliares?: boolean;
  hay_subcontrato?: boolean;
  cantidad_subcontrato?: string | number;
  placa_vehiculo?: string;
}

function getApiBase(): string {
  // Must use dot-notation — Metro/Babel only statically replaces EXPO_PUBLIC_*
  // when accessed as process.env.EXPO_PUBLIC_<NAME>, never bracket notation.
  // eslint-disable-next-line dot-notation
  const domain: string = process.env.EXPO_PUBLIC_DOMAIN ?? "";
  if (!domain) return "/api";
  return `https://${domain}/api`;
}

function flattenMateriales(items: ClaudeMaterial[] | undefined): string {
  if (!items || items.length === 0) return "";
  const lines = items
    .filter((m) => (m.descripcion ?? "").trim().length > 0)
    .map((m) => {
      const qty = (m.cantidad ?? "").trim();
      const desc = (m.descripcion ?? "").trim();
      return qty ? `${qty} x ${desc}` : desc;
    });
  return lines.join("\n");
}

/**
 * Flatten the tecnicos list into a comma-separated string of TAS auxiliary
 * names (es_subcontrato === false). Subcontract entries are ignored here —
 * they're tracked via hay_subcontrato / cantidad_subcontrato instead.
 */
function flattenTecnicos(items: ClaudeTecnico[] | undefined): {
  tasAuxNames: string;
  hasTasAux: boolean | null;
  hasSubcontract: boolean | null;
} {
  if (!items || items.length === 0) {
    return { tasAuxNames: "", hasTasAux: null, hasSubcontract: null };
  }
  const filtered = items.filter((t) => (t.nombre ?? "").trim().length > 0);
  if (filtered.length === 0)
    return { tasAuxNames: "", hasTasAux: null, hasSubcontract: null };

  const tasAux = filtered.filter((t) => t.es_subcontrato !== true);
  const sub = filtered.filter((t) => t.es_subcontrato === true);

  const tasAuxNames = tasAux
    .map((t) => (t.nombre ?? "").trim())
    .filter(Boolean)
    .join(", ");

  return {
    tasAuxNames,
    hasTasAux: tasAux.length > 0 ? true : null,
    hasSubcontract: sub.length > 0 ? true : null,
  };
}

function mergeStrings(
  prev: string | undefined,
  next: string | undefined,
): string | undefined {
  const n = (next ?? "").trim();
  if (!n) return prev;
  return n;
}

/** Normalize a time string from Claude to HH:MM; fall back to raw value. */
function normalizeTime(raw: string | undefined): string | undefined {
  if (!raw || !raw.trim()) return undefined;
  const parsed = parseTimeStr(raw.trim());
  return parsed ?? raw.trim();
}

function claudeToReportData(
  claude: ClaudeResponse,
  current: ReportData,
): ReportData {
  const out: ReportData = { ...current };

  out.tecnico_nombre = mergeStrings(out.tecnico_nombre, claude.tecnico_nombre);
  out.cliente_nombre = mergeStrings(out.cliente_nombre, claude.cliente_nombre);
  out.numero_llamada = mergeStrings(out.numero_llamada, claude.numero_llamada);
  out.numero_proyecto = mergeStrings(out.numero_proyecto, claude.numero_proyecto);
  out.trabajo_realizado = mergeStrings(out.trabajo_realizado, claude.trabajo_realizado);
  out.estado_servicio = mergeStrings(out.estado_servicio, claude.estado_servicio);
  out.descripcion_cotizacion = mergeStrings(
    out.descripcion_cotizacion,
    claude.descripcion_cotizacion,
  );
  out.observaciones = mergeStrings(out.observaciones, claude.observaciones);

  // Normalize time strings to HH:MM
  const entradaNorm = normalizeTime(claude.hora_entrada);
  if (entradaNorm) out.hora_entrada = entradaNorm;

  const salidaNorm = normalizeTime(claude.hora_salida);
  if (salidaNorm) out.hora_salida = salidaNorm;

  if (claude.tipo_servicio && claude.tipo_servicio.length > 0) {
    const existing = out.tipo_servicio
      ? out.tipo_servicio.split(", ").filter(Boolean)
      : [];
    const merged = Array.from(new Set([...existing, ...claude.tipo_servicio]));
    out.tipo_servicio = merged.join(", ");
  }

  const materiales = flattenMateriales(claude.reporte_repuestos);
  if (materiales) out.reporte_repuestos = materiales;

  // Concept A: TAS auxiliary technicians
  // Only carry over extracted names — NEVER pre-fill hay_tecnicos_auxiliares.
  // That question is always asked via chips so the technician must confirm.
  const tecnicos = flattenTecnicos(claude.reporte_tecnicos);
  if (tecnicos.tasAuxNames) out.reporte_tecnicos = tecnicos.tasAuxNames;

  // Concept B: subcontract headcount
  // NEVER pre-fill hay_subcontrato — always asked via chips.
  // Only carry the numeric count if Claude detected one.
  if (claude.cantidad_subcontrato !== undefined && claude.cantidad_subcontrato !== "") {
    out.cantidad_subcontrato = mergeStrings(
      out.cantidad_subcontrato,
      String(claude.cantidad_subcontrato),
    );
  }

  // Only pre-fill hay_cotizacion when Claude has explicit evidence (true).
  // If Claude returns false (the default), leave the field empty so the bot
  // still asks the technician via chips.
  if (claude.hay_cotizacion === true) {
    out.hay_cotizacion = "Sí";
  }

  if (claude.placa_vehiculo) {
    out.placa_vehiculo = mergeStrings(
      out.placa_vehiculo,
      claude.placa_vehiculo.trim().toUpperCase(),
    );
  }

  return out;
}

export async function extractReportFields(
  newText: string,
  current: ReportData,
  fullTranscript?: string,
): Promise<ReportData> {
  const transcript = (fullTranscript ?? newText).trim();
  if (!transcript) return current;

  const url = `${getApiBase()}/extract`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });

    if (!res.ok) {
      console.warn("[extractor] /api/extract failed:", res.status);
      return current;
    }

    const claude = (await res.json()) as ClaudeResponse;
    return claudeToReportData(claude, current);
  } catch (err) {
    console.warn("[extractor] request error:", err);
    return current;
  }
}
