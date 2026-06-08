export type ReportField =
  | "tecnico_nombre"
  | "cliente_nombre"
  | "numero_llamada"
  | "tipo_servicio"
  | "trabajo_realizado"
  | "estado_servicio"
  | "hora_entrada"
  | "hora_salida"
  | "numero_proyecto"
  | "reporte_repuestos"
  | "hay_tecnicos_auxiliares"
  | "reporte_tecnicos"
  | "hay_subcontrato"
  | "cantidad_subcontrato"
  | "hay_cotizacion"
  | "descripcion_cotizacion"
  | "placa_vehiculo"
  | "observaciones";

export type ReportData = Partial<Record<ReportField, string>> & {
  fotos?: string[];
};

export interface QuickReplyOption {
  label: string;
  value: string;
}

export interface ConversationStep {
  field: ReportField;
  prompt: (data: ReportData) => string;
  quickReplies?: QuickReplyOption[];
  disableTyping?: boolean;
  validate?: (input: string) => string | null;
  skipIf?: (data: ReportData) => boolean;
}

export const REQUIRED_FIELDS: ReportField[] = [
  "tecnico_nombre",
  "cliente_nombre",
  "numero_llamada",
  "tipo_servicio",
  "trabajo_realizado",
  "estado_servicio",
];

export const FIELD_ORDER: ReportField[] = [
  // Required — always asked when missing
  "tecnico_nombre",
  "cliente_nombre",
  "numero_llamada",
  "tipo_servicio",
  "trabajo_realizado",
  "estado_servicio",
  // Times — asked together in ONE question; hora_salida is always skipped
  // because the combined question fills both via client-side parsing
  "hora_entrada",
  "hora_salida",
  // Optional details
  "numero_proyecto",
  "reporte_repuestos",
  // Concept A: TAS auxiliary technicians
  "hay_tecnicos_auxiliares",
  "reporte_tecnicos",
  // Concept B: external subcontract headcount
  "hay_subcontrato",
  "cantidad_subcontrato",
  // Commercial / logistics
  "hay_cotizacion",
  "descripcion_cotizacion",
  "placa_vehiculo",
  "observaciones",
];

export const FIELD_LABELS: Record<ReportField, string> = {
  tecnico_nombre: "Técnico",
  cliente_nombre: "Cliente",
  numero_llamada: "Llamada SAP",
  numero_proyecto: "Proyecto",
  tipo_servicio: "Tipo de servicio",
  trabajo_realizado: "Trabajo realizado",
  reporte_repuestos: "Repuestos / materiales",
  hay_tecnicos_auxiliares: "¿Técnicos TAS auxiliares?",
  reporte_tecnicos: "Técnicos auxiliares TAS",
  hay_subcontrato: "¿Personal subcontratado?",
  cantidad_subcontrato: "Personas subcontratadas",
  hora_entrada: "Hora de entrada",
  hora_salida: "Hora de salida",
  estado_servicio: "Estado del servicio",
  hay_cotizacion: "¿Hay algo por cotizar?",
  descripcion_cotizacion: "Detalle a cotizar",
  placa_vehiculo: "Placa del vehículo",
  observaciones: "Observaciones",
};

export const TIPO_SERVICIO_OPTIONS: string[] = [
  "Mantenimiento",
  "Soporte",
  "Instalación",
  "Reparación",
  "Cableado",
  "Programación",
  "Capacitación",
  "Garantía",
  "Estudio",
  "Entrega",
];

export const ESTADO_OPTIONS: string[] = [
  "Terminado",
  "Pendiente de repuesto",
  "Requiere visita adicional",
  "En proceso",
];

export const OMITIR_VALUE = "ninguno";

export const INITIAL_BOT_GREETING =
  "¡Hola! Soy el asistente de TAS para reportes de servicio técnico.\nPuedes contarme todo de una vez (texto o voz) y voy extrayendo los datos. También puedes responder mis preguntas una por una.";

export function buildGreeting(firstName?: string): string {
  if (!firstName) return INITIAL_BOT_GREETING;
  const hour = new Date().getHours();
  const saludo = hour < 12 ? "Buenos días" : hour < 18 ? "Buenas tardes" : "Buenas noches";
  return `${saludo}, ${firstName}. ¿Listo para registrar tu primera visita del día?\nPuedes contarme todo de una vez (texto o voz) y voy extrayendo los datos.`;
}

export const DONE_MESSAGE =
  "¡Listo! Tengo todos los datos. Aquí está el resumen:";

export const EDIT_PROMPT =
  "Cuéntame qué quieres corregir o agregar. Puedes escribir o mandar una nota de voz.";

// ---------------------------------------------------------------------------
// Time-parsing utilities (exported so ChatContext can use them)
// ---------------------------------------------------------------------------

/**
 * Converts a flexible Spanish/English time string to "HH:MM" (24h).
 * Returns null if it cannot parse anything meaningful.
 *
 * Accepts: "9am", "9:00", "9:00am", "9:30 AM", "14:30", "2:30pm", "2pm", "9"
 */
export function parseTimeStr(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  // HH:MM am/pm  e.g. "9:30am", "02:15pm"
  const hhmmAmPm = s.match(/^(\d{1,2}):(\d{2})(am|pm)$/);
  if (hhmmAmPm) {
    let h = parseInt(hhmmAmPm[1]!, 10);
    const m = parseInt(hhmmAmPm[2]!, 10);
    const ap = hhmmAmPm[3];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // HH:MM  e.g. "09:30", "14:00"
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const h = parseInt(hhmm[1]!, 10);
    const m = parseInt(hhmm[2]!, 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59)
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  // H am/pm  e.g. "9am", "2pm"
  const hAmPm = s.match(/^(\d{1,2})(am|pm)$/);
  if (hAmPm) {
    let h = parseInt(hAmPm[1]!, 10);
    const ap = hAmPm[2];
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  // Bare hour only (no am/pm) — accept cautiously
  const bareH = s.match(/^(\d{1,2})$/);
  if (bareH) {
    const h = parseInt(bareH[1]!, 10);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }

  return null;
}

/**
 * Tries to extract an entrada and salida time from a single user message.
 * e.g. "9am - 11:30am", "9:00 a 17:30", "entré a las 9 salí a las 11:30"
 */
export function parseTimePair(
  input: string,
): { entrada: string | null; salida: string | null } {
  const text = input.trim();

  // Pattern: "entré/llegué ... <time> ... salí/terminé ... <time>"
  const narrativeRe =
    /(?:entr[eé]|lleg[uú]e?|ingres[eé])\s+(?:a\s+las?\s+)?([0-9][^\s,]*(?:\s*(?:am|pm))?)\s+.{0,25}?(?:sal[ií]|termin[eé]|sali[oó])\s+(?:a\s+las?\s+)?([0-9][^\s,]*(?:\s*(?:am|pm))?)/i;
  const m1 = text.match(narrativeRe);
  if (m1) {
    return {
      entrada: parseTimeStr(m1[1]?.trim() ?? ""),
      salida: parseTimeStr(m1[2]?.trim() ?? ""),
    };
  }

  // Pattern: split by separator:  "-", "–", "—", "/", " a ", " hasta ", " y "
  const sepRe = /\s*(?:[-–—\/]|(?:\ba\b)|hasta|y)\s*/i;
  const parts = text.split(sepRe).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const a = parseTimeStr(parts[0]!);
    const b = parseTimeStr(parts[parts.length - 1]!);
    if (a || b) return { entrada: a, salida: b };
  }

  // Single time — only entrada
  const single = parseTimeStr(text);
  if (single) return { entrada: single, salida: null };

  return { entrada: null, salida: null };
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

function nonEmpty(message: string) {
  return (v: string) => (v.trim().length < 1 ? message : null);
}

const SKIP_CHIP: QuickReplyOption = { label: "Omitir", value: OMITIR_VALUE };

export const STEP_BY_FIELD: Record<ReportField, ConversationStep> = {
  tecnico_nombre: {
    field: "tecnico_nombre",
    prompt: () => "¿Cuál es tu nombre completo?",
    validate: (v) =>
      v.trim().length < 2 ? "Por favor escribe tu nombre completo." : null,
  },
  cliente_nombre: {
    field: "cliente_nombre",
    prompt: () => "¿Cuál es el nombre del cliente?",
    validate: nonEmpty("Indícame el nombre del cliente."),
  },
  numero_llamada: {
    field: "numero_llamada",
    prompt: () => "¿Cuál es el número de llamada SAP?",
    validate: nonEmpty("Escribe el número de llamada SAP."),
  },
  tipo_servicio: {
    field: "tipo_servicio",
    prompt: () => "¿Qué tipo de servicio realizaste? Toca una opción:",
    disableTyping: true,
    quickReplies: TIPO_SERVICIO_OPTIONS.map((v) => ({ label: v, value: v })),
  },
  trabajo_realizado: {
    field: "trabajo_realizado",
    prompt: () =>
      "Describe el trabajo realizado (puedes escribir o usar el micrófono).",
    validate: (v) =>
      v.trim().length < 5
        ? "Describe el trabajo con un poco más de detalle."
        : null,
  },
  estado_servicio: {
    field: "estado_servicio",
    prompt: () => "¿Cómo quedó el servicio?",
    disableTyping: true,
    quickReplies: ESTADO_OPTIONS.map((v) => ({ label: v, value: v })),
  },

  // ── Times ─────────────────────────────────────────────────────────────────
  // Both times are asked in this SINGLE combined question.
  // Client-side parsing (parseTimePair) extracts both from the answer.
  // hora_salida is always skipped once hora_entrada is set.
  hora_entrada: {
    field: "hora_entrada",
    prompt: () =>
      '¿A qué hora entraste y saliste?\nEj: "9am - 11:30am" o "9:00 - 17:30"',
    quickReplies: [SKIP_CHIP],
    // No strict validation — accept anything; parser handles conversion.
    // If Omitir is tapped, hora_salida is also skipped via its skipIf.
  },
  hora_salida: {
    field: "hora_salida",
    // This step is always skipped because hora_entrada fills it implicitly.
    // It exists only so findNextField can mark it as "handled".
    skipIf: (d) => !!d.hora_entrada,
    prompt: () => "¿A qué hora saliste?",
    quickReplies: [SKIP_CHIP],
  },

  // ── Optional details ──────────────────────────────────────────────────────
  numero_proyecto: {
    field: "numero_proyecto",
    prompt: () => "¿Cuál es el número de proyecto? (opcional)",
    quickReplies: [SKIP_CHIP],
    validate: nonEmpty("Escribe el número de proyecto o toca Omitir."),
  },
  reporte_repuestos: {
    field: "reporte_repuestos",
    prompt: () =>
      '¿Utilizaste repuestos o materiales? Escribe cada uno así: "2 x Cable UTP cat6".',
    quickReplies: [SKIP_CHIP],
    validate: nonEmpty("Escribe los materiales o toca Omitir."),
  },

  // ── Concept A: TAS auxiliary technicians ─────────────────────────────────
  hay_tecnicos_auxiliares: {
    field: "hay_tecnicos_auxiliares",
    prompt: () => "¿Participaron otros técnicos de TAS en este servicio?",
    disableTyping: true,
    quickReplies: [
      { label: "Sí", value: "Sí" },
      { label: "No", value: "No" },
    ],
  },
  reporte_tecnicos: {
    field: "reporte_tecnicos",
    prompt: () => "¿Cuáles son sus nombres? (separados por coma)",
    skipIf: (d) => d.hay_tecnicos_auxiliares !== "Sí",
    validate: nonEmpty("Escribe los nombres de los técnicos auxiliares."),
  },

  // ── Concept B: external subcontract headcount ─────────────────────────────
  hay_subcontrato: {
    field: "hay_subcontrato",
    prompt: () => "¿Hubo personal subcontratado trabajando en el sitio?",
    disableTyping: true,
    quickReplies: [
      { label: "Sí", value: "Sí" },
      { label: "No", value: "No" },
    ],
  },
  cantidad_subcontrato: {
    field: "cantidad_subcontrato",
    prompt: () =>
      "¿Cuántas personas del subcontrato estuvieron en el sitio?",
    skipIf: (d) => d.hay_subcontrato !== "Sí",
    validate: (v) => {
      if (v.trim().toLowerCase() === OMITIR_VALUE) return null;
      const n = parseInt(v.trim(), 10);
      return isNaN(n) || n < 1
        ? "Ingresa un número válido (por ejemplo: 3)."
        : null;
    },
  },

  // ── Commercial / logistics ────────────────────────────────────────────────
  hay_cotizacion: {
    field: "hay_cotizacion",
    prompt: () => "¿Hay algo que cotizar o una oportunidad comercial?",
    disableTyping: true,
    quickReplies: [
      { label: "Sí", value: "Sí" },
      { label: "No", value: "No" },
    ],
  },
  descripcion_cotizacion: {
    field: "descripcion_cotizacion",
    prompt: () => "Describe brevemente qué hay por cotizar.",
    validate: (v) =>
      v.trim().length < 3 ? "Cuéntame brevemente qué hay por cotizar." : null,
    skipIf: (d) => d.hay_cotizacion !== "Sí",
  },
  placa_vehiculo: {
    field: "placa_vehiculo",
    prompt: () =>
      "¿Usaste un vehículo TAS? Escribe la placa (ej: P3897A) o toca Omitir.",
    quickReplies: [SKIP_CHIP],
    validate: (v) => {
      if (v.trim().toLowerCase() === OMITIR_VALUE) return null;
      const plate = v.trim().toUpperCase();
      return plate.length >= 5 && /^[A-Z0-9]+$/.test(plate)
        ? null
        : "Escribe la placa del vehículo (letras y números, mín. 5 chars) o toca Omitir.";
    },
  },
  observaciones: {
    field: "observaciones",
    prompt: () =>
      "¿Alguna observación adicional para el supervisor? (opcional)",
    quickReplies: [SKIP_CHIP],
    validate: nonEmpty("Escribe una observación o toca Omitir."),
  },
};

/**
 * Returns the next field that still needs to be filled, walking FIELD_ORDER
 * in order and applying all skip rules. Returns null when the report is
 * complete (all fields filled or intentionally skipped).
 */
export function findNextField(data: ReportData): ReportField | null {
  for (const field of FIELD_ORDER) {
    const step = STEP_BY_FIELD[field];

    // Apply conditional skip rules
    if (step.skipIf?.(data)) continue;

    // Skip fields that are already filled (including intentional "ninguno")
    const val = data[field];
    if (val && val.trim().length > 0) continue;

    return field;
  }
  return null;
}
