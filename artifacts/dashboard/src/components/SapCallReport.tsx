import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft, ArrowRight, Download, FileText, Clock, User, Wrench, Package,
  AlertCircle, MapPin, Route, X, Camera, Building2, CheckCircle2, XCircle,
  AlertTriangle, BarChart3,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RouteMapModal } from "@/components/RouteMapModal";

const API = `${window.location.origin}/api`;

interface SapCallReportProps {
  numeroChamada: string;
  onBack: () => void;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CallRepuesto { cantidad: string | null; descripcion: string; }
interface CallTecnico { nombre: string; es_subcontrato: boolean; }
interface TasBoleta {
  id: string; numero_reporte: number | null; created_at: string | null;
  tecnico_nombre: string | null; cliente_nombre: string; numero_proyecto: string | null;
  tipo_servicio: string | null; trabajo_realizado: string | null;
  hora_entrada: string | null; hora_salida: string | null; horas_trabajadas: number | null;
  estado_servicio: string | null; hay_cotizacion: boolean | null; descripcion_cotizacion: string | null;
  observaciones: string | null; placa_vehiculo: string | null; es_subcontrato: boolean | null;
  empresa_subcontrato: string | null; cantidad_personas_subcontrato: string | null;
  fotos: string[]; firma_cliente_url: string | null;
  tecnicos: CallTecnico[]; repuestos: CallRepuesto[];
}
interface SubActividad { id: string; nombre: string; porcentaje_avance: number; orden: number; }
interface SubReporteFoto { id: string; reporte_id: string; url: string; tipo: string; }
interface SubReporte {
  id: string; proyecto_id: string; fecha: string;
  actividad_nombre: string | null; descripcion: string | null; descripcion_trabajo: string | null;
  porcentaje_avance: number; estado: string;
  tecnicos_presentes: Array<{ nombre: string }> | null; cantidad_tecnicos: number | null;
  foto_checkin_url: string | null; foto_checkout_url: string | null; created_at: string;
  fotos: SubReporteFoto[];
}
interface SubProyecto {
  id: string; nombre: string; cliente_nombre: string; empresa_nombre: string;
  supervisor_nombre: string | null; fecha_inicio: string | null; fecha_fin_estimada: string | null;
  dias_maximos: number; dias_utilizados: number; estado: string;
  dias_transcurridos: number; dias_restantes: number; porcentaje_dias: number;
  actividades: SubActividad[]; reportes: SubReporte[];
}
interface CallReportData {
  numero_llamada: string;
  boletas: TasBoleta[];
  total_boletas: number;
  fecha_primera: string | null;
  fecha_ultima: string | null;
  total_horas: number;
  tecnicos_involucrados: string[];
  todos_repuestos: string[];
  subcontrato_proyectos: SubProyecto[];
}

// ─── Custom fetch hook ────────────────────────────────────────────────────────

function useSapCallData(numero: string) {
  const [data, setData] = useState<CallReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true); setErrorMsg(null);
    try {
      const res = await fetch(`${API}/reports/by-call?numero=${encodeURIComponent(numero)}`);
      const json = await res.json();
      if (!res.ok) { setErrorMsg(json.error ?? "Error al cargar datos"); }
      else setData(json as CallReportData);
    } catch { setErrorMsg("Error de conexión"); }
    finally { setIsLoading(false); }
  }, [numero]);

  useEffect(() => { load(); }, [load]);
  return { data, isLoading, errorMsg };
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function generatePdf(data: CallReportData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, MARGIN = 14, contentW = W - MARGIN * 2;
  let y = 0;
  const addPage = () => { doc.addPage(); y = MARGIN; };
  const checkPage = (needed: number) => { if (y + needed > 280) addPage(); };

  // Header
  doc.setFillColor(26, 26, 26); doc.rect(0, 0, W, 28, "F");
  doc.setFillColor(204, 0, 0); doc.rect(0, 28, W, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("TAS El Salvador", MARGIN, 11);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text("Soluciones de Seguridad y Tecnología", MARGIN, 17);
  doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(`Reporte Unificado — Llamada SAP #${data.numero_llamada}`, MARGIN, 24);
  doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}`, W - MARGIN, 24, { align: "right" });
  y = 36;

  // Summary strip
  doc.setFillColor(245, 245, 245); doc.rect(MARGIN, y, contentW, 14, "F");
  const summaryItems = [
    { label: "Visitas TAS", value: String(data.total_boletas) },
    { label: "Proyectos Subcontrato", value: String(data.subcontrato_proyectos.length) },
    { label: "Horas TAS", value: `${data.total_horas}h` },
    { label: "Técnicos TAS", value: String(data.tecnicos_involucrados.length) },
  ];
  const colW = contentW / summaryItems.length;
  summaryItems.forEach((item, i) => {
    const x = MARGIN + i * colW + colW / 2;
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 100, 100);
    doc.text(item.label, x, y + 5, { align: "center" });
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 30);
    doc.text(item.value, x, y + 11, { align: "center" });
  });
  y += 20;

  const loadImgBase64 = (url: string): Promise<{ data: string; format: string } | null> =>
    new Promise((resolve) => {
      const img = new Image(); img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext("2d"); if (!ctx) { resolve(null); return; }
          ctx.drawImage(img, 0, 0);
          resolve({ data: canvas.toDataURL("image/jpeg", 0.75), format: "JPEG" });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null); img.src = url;
    });

  const field = (label: string, value: string | null | undefined) => {
    if (!value) return;
    checkPage(6);
    doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text(`${label}:`, MARGIN + 2, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(value, contentW - 40);
    doc.text(lines, MARGIN + 42, y); y += Math.max(5, lines.length * 4.5);
  };

  // ── Section 1: TAS boletas
  if (data.boletas.length > 0) {
    checkPage(12);
    doc.setFillColor(30, 64, 175); doc.rect(MARGIN, y, contentW, 8, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`SECCIÓN 1 — Visitas Técnicas TAS (${data.boletas.length})`, MARGIN + 2, y + 5.5);
    y += 12;

    for (let bi = 0; bi < data.boletas.length; bi++) {
      const b = data.boletas[bi]!; checkPage(50);
      doc.setFillColor(59, 130, 246); doc.rect(MARGIN, y, contentW, 7, "F");
      doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
      const bolFecha = b.created_at ? format(new Date(b.created_at), "dd/MM/yyyy") : "-";
      doc.text(`[TAS] Boleta #${b.numero_reporte ?? bi + 1} — ${bolFecha} — ${b.cliente_nombre}`, MARGIN + 2, y + 5);
      y += 9;
      field("Técnico", b.tecnico_nombre); field("Tipo de servicio", b.tipo_servicio);
      field("Horario", b.hora_entrada && b.hora_salida ? `${b.hora_entrada} → ${b.hora_salida} (${b.horas_trabajadas ?? 0}h)` : null);
      field("Estado", b.estado_servicio);
      if (b.trabajo_realizado) { checkPage(10); doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text("Trabajo:", MARGIN + 2, y); y += 4.5; doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); const ls = doc.splitTextToSize(b.trabajo_realizado, contentW - 6); ls.forEach((l: string) => { checkPage(5); doc.text(l, MARGIN + 4, y); y += 4.5; }); }
      if (b.fotos.length > 0) {
        checkPage(12); doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text(`Fotos (${b.fotos.length}):`, MARGIN + 2, y); y += 5;
        const thumbW = 38, thumbH = 28, gap = 3, perRow = 4;
        for (let pi = 0; pi < b.fotos.slice(0, 8).length; pi++) {
          const col = pi % perRow; if (col === 0 && pi > 0) y += thumbH + gap; checkPage(thumbH + gap);
          const px = MARGIN + 2 + col * (thumbW + gap);
          try { const id = await loadImgBase64(b.fotos[pi]!); if (id) { doc.addImage(id.data, id.format, px, y, thumbW, thumbH); doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.2); doc.rect(px, y, thumbW, thumbH); } } catch { /* skip */ }
        }
        y += thumbH + gap + 2;
      }
      y += 3;
      if (bi < data.boletas.length - 1) { checkPage(4); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(MARGIN, y, MARGIN + contentW, y); y += 6; }
    }
  }

  // ── Section 2: Subcontract projects
  if (data.subcontrato_proyectos.length > 0) {
    checkPage(14);
    y += 4;
    doc.setFillColor(194, 65, 12); doc.rect(MARGIN, y, contentW, 8, "F");
    doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(`SECCIÓN 2 — Actividades Subcontrato (${data.subcontrato_proyectos.length} proyecto(s))`, MARGIN + 2, y + 5.5);
    y += 12;

    for (const p of data.subcontrato_proyectos) {
      checkPage(30);
      doc.setFillColor(254, 215, 170); doc.rect(MARGIN, y, contentW, 7, "F");
      doc.setTextColor(154, 52, 18); doc.setFontSize(9); doc.setFont("helvetica", "bold");
      doc.text(`[SUBCONTRATO] ${p.nombre} — ${p.empresa_nombre}`, MARGIN + 2, y + 5);
      y += 9;
      field("Cliente", p.cliente_nombre); field("Supervisor TAS", p.supervisor_nombre);
      field("Días", `${p.dias_transcurridos ?? p.dias_utilizados} de ${p.dias_maximos} días (${p.dias_restantes < 0 ? `${Math.abs(p.dias_restantes)} días de retraso` : `${p.dias_restantes} restantes`})`);
      if (p.actividades.length > 0) {
        checkPage(8); doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text("Actividades:", MARGIN + 2, y); y += 4.5;
        p.actividades.forEach((a) => { checkPage(5); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.text(`• ${a.nombre} — ${a.porcentaje_avance}%`, MARGIN + 4, y); y += 4.5; });
      }
      if (p.reportes.length > 0) {
        checkPage(8); doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text(`Reportes diarios (${p.reportes.length}):`, MARGIN + 2, y); y += 5;
        p.reportes.forEach((r) => {
          checkPage(12); const tecs = r.tecnicos_presentes?.map((t) => t.nombre).join(", ") ?? `${r.cantidad_tecnicos ?? "?"} téc.`;
          doc.setFont("helvetica", "bold"); doc.setTextColor(50, 50, 50); doc.text(`${r.fecha} · ${r.actividad_nombre ?? "—"} · ${r.porcentaje_avance}% · ${r.estado.toUpperCase()}`, MARGIN + 4, y); y += 4.5;
          const desc = r.descripcion || r.descripcion_trabajo;
          if (desc) { doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80); const ls = doc.splitTextToSize(desc, contentW - 8); ls.forEach((l: string) => { checkPage(5); doc.text(l, MARGIN + 6, y); y += 4; }); }
          doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120); doc.text(`Técnicos: ${tecs}`, MARGIN + 6, y); y += 6;
        });
      }
      y += 4; checkPage(4); doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(MARGIN, y, MARGIN + contentW, y); y += 6;
    }
  }

  // ── Section 3: Executive summary
  checkPage(30); y += 4;
  doc.setFillColor(26, 26, 26); doc.rect(MARGIN, y, contentW, 7, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont("helvetica", "bold");
  doc.text("SECCIÓN 3 — Resumen Ejecutivo", MARGIN + 2, y + 5); y += 10;

  const totalSubReportes = data.subcontrato_proyectos.reduce((s, p) => s + p.reportes.length, 0);
  const allSubTecs = new Set<string>();
  data.subcontrato_proyectos.forEach((p) => p.reportes.forEach((r) => r.tecnicos_presentes?.forEach((t) => allSubTecs.add(t.nombre))));
  const allActs = data.subcontrato_proyectos.flatMap((p) => p.actividades);
  const actsComp = allActs.filter((a) => a.porcentaje_avance >= 100).length;

  const sf = (label: string, value: string) => { checkPage(6); doc.setTextColor(100, 100, 100); doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.text(`${label}:`, MARGIN + 2, y); doc.setFont("helvetica", "normal"); doc.setTextColor(30, 30, 30); doc.text(value, MARGIN + 55, y); y += 5; };
  sf("Total visitas TAS", String(data.total_boletas));
  sf("Total reportes subcontrato", String(totalSubReportes));
  sf("Técnicos TAS", data.tecnicos_involucrados.join(", ") || "—");
  sf("Técnicos subcontrato", Array.from(allSubTecs).join(", ") || "—");
  sf("Horas TAS trabajadas", `${data.total_horas}h`);
  sf("Actividades subcontrato", `${actsComp} completadas de ${allActs.length} totales`);

  // Footer
  const totalPages = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setTextColor(150, 150, 150);
    doc.text(`TAS El Salvador — Llamada SAP #${data.numero_llamada} — Pág. ${p}/${totalPages}`, W / 2, 292, { align: "center" });
  }

  doc.save(`Reporte_Llamada_${data.numero_llamada}_${format(new Date(), "yyyyMMdd")}.pdf`);
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ photos, initialIndex, onClose }: { photos: string[]; initialIndex: number; onClose: () => void }) {
  const [current, setCurrent] = useState(initialIndex);
  const prev = useCallback(() => setCurrent((i) => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setCurrent((i) => (i + 1) % photos.length), [photos.length]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next(); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [onClose, prev, next]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose}>
      <button className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={onClose}><X className="h-5 w-5" /></button>
      {photos.length > 1 && <button className="absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); prev(); }}><ArrowLeft className="h-5 w-5" /></button>}
      <div className="relative max-h-[85vh] max-w-[85vw]" onClick={(e) => e.stopPropagation()}>
        <img src={photos[current]} alt={`${current + 1}/${photos.length}`} className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain shadow-2xl" />
      </div>
      {photos.length > 1 && <button className="absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); next(); }}><ArrowRight className="h-5 w-5" /></button>}
      {photos.length > 1 && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-sm font-medium text-white">{current + 1} / {photos.length}</div>}
    </div>
  );
}

// ─── TAS Boleta Card ──────────────────────────────────────────────────────────

function toSVDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return new Date(d.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function FieldItem({ label, value, sub, icon }: { label: string; value?: string | null; sub?: string; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium mb-0.5 flex items-center gap-1">{icon}{label}</p>
      <p className="text-sm font-medium">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BoletaCard({ boleta: b, index }: { boleta: TasBoleta; index: number }) {
  const isCompleted = b.estado_servicio === "Terminado";
  const [routeOpen, setRouteOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const boletaDate = toSVDate(b.created_at);
  const canShowRoute = !!b.placa_vehiculo && !!boletaDate;

  return (
    <Card className="border-border overflow-hidden">
      <div className="bg-[#1A1A1A] px-4 py-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-bold shrink-0">{index + 1}</div>
          <div>
            <p className="text-sm font-semibold text-white">
              Boleta #{b.numero_reporte ?? index + 1}
              {b.created_at && <span className="text-gray-400 font-normal ml-2">{format(new Date(b.created_at), "dd 'de' MMMM yyyy", { locale: es })}</span>}
            </p>
            <p className="text-xs text-gray-400">{b.cliente_nombre}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="border-0 text-xs bg-blue-600/20 text-blue-400 font-semibold">TAS</Badge>
          {b.placa_vehiculo && <span className="flex items-center gap-1 font-mono text-xs rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-emerald-400"><MapPin className="h-3 w-3" />{b.placa_vehiculo}</span>}
          {canShowRoute && <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30" onClick={() => setRouteOpen(true)}><Route className="h-3 w-3" />Ver Ruta</Button>}
          <Badge className={`border-0 text-xs ${isCompleted ? "bg-green-600/20 text-green-400" : "bg-amber-600/20 text-amber-400"}`}>{b.estado_servicio ?? "Sin estado"}</Badge>
        </div>
      </div>
      {canShowRoute && <RouteMapModal isOpen={routeOpen} onClose={() => setRouteOpen(false)} plate={b.placa_vehiculo!} date={boletaDate!} horaEntrada={b.hora_entrada ?? undefined} horaSalida={b.hora_salida ?? undefined} />}
      {lightbox.open && b.fotos.length > 0 && <Lightbox photos={b.fotos} initialIndex={lightbox.index} onClose={() => setLightbox({ open: false, index: 0 })} />}
      <CardContent className="pt-4 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-sm">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FieldItem label="Técnico" value={b.tecnico_nombre} icon={<User className="h-3.5 w-3.5" />} />
              <FieldItem label="Tipo de servicio" value={b.tipo_servicio} icon={<Wrench className="h-3.5 w-3.5" />} />
              <FieldItem label="Horario" value={b.hora_entrada && b.hora_salida ? `${b.hora_entrada} → ${b.hora_salida}` : null} sub={b.horas_trabajadas ? `${b.horas_trabajadas}h trabajadas` : undefined} icon={<Clock className="h-3.5 w-3.5" />} />
              {b.numero_proyecto && <FieldItem label="Proyecto #" value={b.numero_proyecto} />}
            </div>
            {b.trabajo_realizado && <div><p className="text-xs text-muted-foreground font-medium mb-1">Trabajo realizado</p><p className="text-sm whitespace-pre-wrap leading-relaxed">{b.trabajo_realizado}</p></div>}
            {b.observaciones && <div><p className="text-xs text-muted-foreground font-medium mb-1">Observaciones</p><p className="text-sm text-muted-foreground whitespace-pre-wrap">{b.observaciones}</p></div>}
          </div>
          <div className="space-y-3">
            {b.tecnicos.length > 0 && <div><p className="text-xs text-muted-foreground font-medium mb-1.5">Técnicos adicionales</p><div className="flex flex-wrap gap-1.5">{b.tecnicos.map((t, i) => <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${t.es_subcontrato ? "border-orange-500/40 bg-orange-500/10 text-orange-400" : "border-blue-500/40 bg-blue-500/10 text-blue-400"}`}>{t.nombre}{t.es_subcontrato ? " (sub.)" : ""}</span>)}</div></div>}
            {b.repuestos.length > 0 && <div><p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1"><Package className="h-3.5 w-3.5" />Repuestos</p><ul className="space-y-1">{b.repuestos.map((r, i) => <li key={i} className="flex items-start gap-2 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" /><span>{r.cantidad && <span className="font-mono font-semibold">{r.cantidad}× </span>}{r.descripcion}</span></li>)}</ul></div>}
            {b.fotos.length > 0 && <div><p className="text-xs text-muted-foreground font-medium mb-1.5 flex items-center gap-1"><Camera className="h-3.5 w-3.5" />Fotos ({b.fotos.length})</p><div className="flex flex-wrap gap-2">{b.fotos.slice(0, 6).map((url, i) => <img key={i} src={url} alt="" className="h-16 w-16 rounded-lg object-cover cursor-pointer border border-border" onClick={() => setLightbox({ open: true, index: i })} />)}{b.fotos.length > 6 && <div className="h-16 w-16 rounded-lg border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground cursor-pointer" onClick={() => setLightbox({ open: true, index: 6 })}>+{b.fotos.length - 6}</div>}</div></div>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Subcontract Project Card ─────────────────────────────────────────────────

function SubProyectoCard({ proyecto: p }: { proyecto: SubProyecto }) {
  const [expandedReporte, setExpandedReporte] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ photos: string[]; index: number } | null>(null);
  const pct = p.porcentaje_dias ?? (p.dias_maximos > 0 ? Math.round((p.dias_utilizados / p.dias_maximos) * 100) : 0);
  const barColor = pct > 100 ? "#8B0000" : pct >= 90 ? "#CC0000" : pct >= 70 ? "#F59E0B" : "#22C55E";
  const avgAvance = p.actividades.length > 0 ? Math.round(p.actividades.reduce((s, a) => s + a.porcentaje_avance, 0) / p.actividades.length) : 0;

  const estadoIcon = (estado: string) => {
    if (estado === "aprobado") return <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />;
    if (estado === "rechazado") return <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    return <AlertTriangle className="h-3.5 w-3.5 text-yellow-400 shrink-0" />;
  };

  return (
    <>
      {lightbox && <Lightbox photos={lightbox.photos} initialIndex={lightbox.index} onClose={() => setLightbox(null)} />}
      <Card className="border-orange-500/30 overflow-hidden">
        {/* Header */}
        <div className="bg-[#1C1108] px-4 py-3 flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-white shrink-0"><Building2 className="h-3.5 w-3.5" /></div>
            <div>
              <p className="text-sm font-semibold text-white">{p.nombre}</p>
              <p className="text-xs text-orange-300/70">{p.empresa_nombre} · {p.cliente_nombre}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="border-0 text-xs bg-orange-600/25 text-orange-400 font-semibold">SUBCONTRATO</Badge>
            <Badge className={`border-0 text-xs ${p.estado === "activo" ? "bg-blue-600/20 text-blue-400" : "bg-green-600/20 text-green-400"}`}>{p.estado}</Badge>
          </div>
        </div>

        <CardContent className="pt-4 pb-4 space-y-4">
          {/* Days bar */}
          <div className="flex items-center gap-3">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1"><span className="text-muted-foreground">Días transcurridos</span><span className={`font-semibold ${pct > 100 ? "text-red-700" : pct >= 90 ? "text-red-400" : pct >= 70 ? "text-yellow-400" : "text-foreground"}`}>{p.dias_transcurridos ?? p.dias_utilizados} de {p.dias_maximos} días — {p.dias_restantes < 0 ? `${Math.abs(p.dias_restantes)} días de retraso` : `${p.dias_restantes} restantes`} ({pct}%)</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} /></div>
            </div>
          </div>

          {/* Activities */}
          {p.actividades.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1"><BarChart3 className="h-3.5 w-3.5" />Actividades — {avgAvance}% promedio de avance</p>
              <div className="space-y-1.5">
                {p.actividades.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <span className="text-xs text-foreground flex-1 truncate">{a.nombre}</span>
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden shrink-0"><div className="h-full rounded-full bg-orange-500" style={{ width: `${a.porcentaje_avance}%` }} /></div>
                    <span className="text-xs font-mono text-muted-foreground w-8 text-right shrink-0">{a.porcentaje_avance}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daily reports */}
          {p.reportes.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2">{p.reportes.length} reporte{p.reportes.length !== 1 ? "s" : ""} diario{p.reportes.length !== 1 ? "s" : ""}</p>
              <div className="space-y-1.5">
                {p.reportes.map((r) => {
                  const allPhotos = [...(r.foto_checkin_url ? [r.foto_checkin_url] : []), ...(r.fotos.map((f) => f.url)), ...(r.foto_checkout_url ? [r.foto_checkout_url] : [])];
                  const isOpen = expandedReporte === r.id;
                  const tecs = r.tecnicos_presentes?.map((t) => t.nombre).join(", ") ?? (r.cantidad_tecnicos ? `${r.cantidad_tecnicos} técnico(s)` : "—");
                  return (
                    <div key={r.id} className="rounded-lg border border-border overflow-hidden">
                      <button onClick={() => setExpandedReporte(isOpen ? null : r.id)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors">
                        {estadoIcon(r.estado)}
                        <span className="text-xs font-semibold text-foreground">{r.fecha}</span>
                        <span className="text-xs text-muted-foreground">{r.actividad_nombre ?? "—"}</span>
                        <span className="ml-auto text-xs font-mono text-orange-400">{r.porcentaje_avance}%</span>
                        {allPhotos.length > 0 && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Camera className="h-3 w-3" />{allPhotos.length}</span>}
                      </button>
                      {isOpen && (
                        <div className="border-t border-border px-3 py-2.5 bg-muted/20 space-y-2">
                          <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">Técnicos:</span> {tecs}</p>
                          {(r.descripcion || r.descripcion_trabajo) && <p className="text-xs text-muted-foreground leading-relaxed"><span className="font-medium text-foreground">Trabajo:</span> {r.descripcion || r.descripcion_trabajo}</p>}
                          {allPhotos.length > 0 && <div className="flex flex-wrap gap-1.5">{allPhotos.map((url, i) => <img key={i} src={url} alt="" className="h-14 w-14 rounded object-cover cursor-pointer border border-border" onClick={() => setLightbox({ photos: allPhotos, index: i })} />)}</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Supervisor */}
          {p.supervisor_nombre && <p className="text-xs text-muted-foreground border-t border-border pt-2"><span className="font-medium text-foreground">Supervisor TAS:</span> {p.supervisor_nombre}</p>}
        </CardContent>
      </Card>
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SapCallReport({ numeroChamada, onBack }: SapCallReportProps) {
  const { data, isLoading, errorMsg } = useSapCallData(numeroChamada);
  const [pdfLoading, setPdfLoading] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Volver al dashboard</Button>
        <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      </div>
    );
  }

  if (errorMsg || !data) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Volver al dashboard</Button>
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" /><span>{errorMsg ?? "No se encontraron reportes para ese número de llamada."}</span></div>
      </div>
    );
  }

  const { boletas, subcontrato_proyectos, total_boletas, fecha_primera, fecha_ultima, total_horas, tecnicos_involucrados, todos_repuestos } = data;

  const periodoStr = (() => {
    if (!fecha_primera) return "-";
    if (fecha_primera === fecha_ultima) return format(new Date(fecha_primera + "T12:00:00"), "dd 'de' MMMM yyyy", { locale: es });
    return `${format(new Date(fecha_primera + "T12:00:00"), "dd/MM/yyyy")} al ${format(new Date((fecha_ultima ?? fecha_primera) + "T12:00:00"), "dd/MM/yyyy")}`;
  })();

  const totalSubReportes = subcontrato_proyectos.reduce((s, p) => s + p.reportes.length, 0);
  const allSubTecs = new Set<string>();
  subcontrato_proyectos.forEach((p) => p.reportes.forEach((r) => r.tecnicos_presentes?.forEach((t) => allSubTecs.add(t.nombre))));
  const allActividades = subcontrato_proyectos.flatMap((p) => p.actividades);
  const actsCompletadas = allActividades.filter((a) => a.porcentaje_avance >= 100).length;

  // Build unified chronological timeline
  type TimelineEvent = { date: string; label: string; detail: string; type: "tas" | "sub"; };
  const timelineEvents: TimelineEvent[] = [
    ...boletas.filter((b) => b.created_at).map((b) => ({
      date: b.created_at!.slice(0, 10),
      label: `Visita TAS — ${b.tecnico_nombre ?? ""}`,
      detail: b.tipo_servicio ?? "Sin tipo",
      type: "tas" as const,
    })),
    ...subcontrato_proyectos.flatMap((p) =>
      p.reportes.map((r) => ({
        date: r.fecha,
        label: `${p.empresa_nombre} — ${r.actividad_nombre ?? ""}`,
        detail: `${r.porcentaje_avance}% avance · ${r.estado}`,
        type: "sub" as const,
      }))
    ),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="mt-0.5"><ArrowLeft className="h-4 w-4 mr-1" />Volver al dashboard</Button>
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              Reporte Llamada SAP <span className="text-red-500 font-mono">#{numeroChamada}</span>
            </h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {total_boletas > 0 && <span className="rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2.5 py-0.5 text-xs font-semibold">{total_boletas} visita{total_boletas !== 1 ? "s" : ""} TAS</span>}
              {subcontrato_proyectos.length > 0 && <span className="rounded-full bg-orange-600/20 text-orange-400 border border-orange-500/30 px-2.5 py-0.5 text-xs font-semibold">{totalSubReportes} reporte{totalSubReportes !== 1 ? "s" : ""} subcontrato</span>}
              {periodoStr !== "-" && <span className="text-xs text-muted-foreground">{periodoStr}</span>}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" disabled={pdfLoading} onClick={async () => { setPdfLoading(true); await generatePdf(data); setPdfLoading(false); }}>
          <Download className="h-4 w-4" />{pdfLoading ? "Generando…" : "Exportar PDF"}
        </Button>
      </div>

      {/* KPI summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-600/5 border-blue-500/20"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Visitas TAS</p><p className="text-2xl font-bold mt-1 text-blue-400">{total_boletas}</p></CardContent></Card>
        <Card className="bg-orange-600/5 border-orange-500/20"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Reportes subcontrato</p><p className="text-2xl font-bold mt-1 text-orange-400">{totalSubReportes}</p></CardContent></Card>
        <Card className="bg-card/60"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Horas TAS</p><p className="text-2xl font-bold mt-1">{total_horas}h</p></CardContent></Card>
        <Card className="bg-card/60"><CardContent className="pt-4 pb-3"><p className="text-xs text-muted-foreground">Período</p><p className="text-sm font-semibold mt-1 leading-tight">{periodoStr}</p></CardContent></Card>
      </div>

      {/* ── Section 1: TAS Visits ──────────────────────────────────────────────── */}
      {total_boletas > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-1 w-6 rounded-full bg-blue-500" />
            <h3 className="text-base font-semibold">Visitas Técnicas TAS</h3>
            <span className="rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 text-xs font-semibold">{total_boletas}</span>
          </div>
          <div className="space-y-4">
            {boletas.map((b, i) => <BoletaCard key={b.id} boleta={b} index={i} />)}
          </div>
        </section>
      )}

      {/* ── Section 2: Subcontract Activities ─────────────────────────────────── */}
      {subcontrato_proyectos.length > 0 && (
        <section>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-1 w-6 rounded-full bg-orange-500" />
            <h3 className="text-base font-semibold">Actividades Subcontrato</h3>
            <span className="rounded-full bg-orange-600/20 text-orange-400 border border-orange-500/30 px-2 py-0.5 text-xs font-semibold">{subcontrato_proyectos.length} proyecto{subcontrato_proyectos.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="space-y-4">
            {subcontrato_proyectos.map((p) => <SubProyectoCard key={p.id} proyecto={p} />)}
          </div>
        </section>
      )}

      {/* ── Section 3: Executive Summary ──────────────────────────────────────── */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-red-500" />Resumen Ejecutivo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div><p className="text-xs text-muted-foreground font-medium mb-1">Visitas TAS</p><p className="text-2xl font-bold text-blue-400">{total_boletas}</p></div>
            <div><p className="text-xs text-muted-foreground font-medium mb-1">Reportes subcontrato</p><p className="text-2xl font-bold text-orange-400">{totalSubReportes}</p></div>
            <div><p className="text-xs text-muted-foreground font-medium mb-1">Horas TAS totales</p><p className="text-2xl font-bold">{total_horas}h</p></div>
            <div><p className="text-xs text-muted-foreground font-medium mb-2">Técnicos TAS</p><div className="space-y-1">{tecnicos_involucrados.map((t) => <div key={t} className="flex items-center gap-2 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />{t}</div>)}{tecnicos_involucrados.length === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}</div></div>
            <div><p className="text-xs text-muted-foreground font-medium mb-2">Técnicos subcontrato</p><div className="space-y-1">{Array.from(allSubTecs).map((t) => <div key={t} className="flex items-center gap-2 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />{t}</div>)}{allSubTecs.size === 0 && <p className="text-xs text-muted-foreground">Sin datos</p>}</div></div>
            {allActividades.length > 0 && <div><p className="text-xs text-muted-foreground font-medium mb-1">Actividades subcontrato</p><p className="text-sm font-semibold">{actsCompletadas} completas de {allActividades.length}</p><div className="h-1.5 mt-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round((actsCompletadas / allActividades.length) * 100)}%` }} /></div></div>}
          </div>

          {/* Unified timeline */}
          {timelineEvents.length > 1 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-3 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Timeline cronológico combinado</p>
              <div className="relative pl-4">
                <div className="absolute left-1.5 top-0 bottom-0 w-0.5 bg-border" />
                {timelineEvents.map((ev, i) => (
                  <div key={i} className="relative mb-3 last:mb-0">
                    <div className={`absolute -left-3 top-1 h-3 w-3 rounded-full border-2 border-background ${ev.type === "tas" ? "bg-blue-500" : "bg-orange-500"}`} />
                    <div className="pl-3">
                      <p className="text-xs font-semibold">{format(new Date(ev.date + "T12:00:00"), "dd MMM yyyy", { locale: es })} · <span className={`${ev.type === "tas" ? "text-blue-400" : "text-orange-400"}`}>{ev.type === "tas" ? "TAS" : "Sub."}</span></p>
                      <p className="text-xs text-foreground">{ev.label}</p>
                      <p className="text-xs text-muted-foreground">{ev.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {todos_repuestos.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-2 flex items-center gap-1"><Package className="h-3.5 w-3.5" />Materiales TAS utilizados</p>
              <ul className="space-y-1">{todos_repuestos.map((r, i) => <li key={i} className="flex items-start gap-2 text-xs"><div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />{r}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
