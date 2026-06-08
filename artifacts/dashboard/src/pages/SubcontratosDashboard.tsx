import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Clock, CheckCircle, AlertTriangle, FolderOpen,
  ChevronDown, ChevronUp, X, Check, Calendar, Users, Percent,
  FileText, Plus, Pencil, PowerOff, Filter, Info,
} from "lucide-react";
import { DashboardNav } from "@/components/DashboardNav";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${window.location.origin}/api`;

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Foto { id: string; reporte_id: string; url: string; tipo: string; }

interface Reporte {
  id: string; proyecto_id: string; fecha: string;
  actividad_nombre: string | null; descripcion: string | null;
  descripcion_trabajo: string | null;
  tecnicos_presentes: Array<{ nombre: string }> | null;
  cantidad_tecnicos: number | null; porcentaje_avance: number;
  porcentaje_acumulado: number | null;
  hora_entrada: string | null; hora_salida: string | null;
  estado: string; comentario_rechazo: string | null;
  aprobado_por: string | null; aprobado_at: string | null;
  foto_checkin_url: string | null; foto_checkout_url: string | null;
  created_at: string; proyecto: Proyecto | null; fotos: Foto[];
}

interface Proyecto {
  id: string; nombre: string; cliente_nombre: string;
  empresa_id: string | null; supervisor_id: string | null;
  supervisor_nombre: string | null;
  supervisor_correo: string | null; numero_proyecto: string | null;
  fecha_inicio: string | null; fecha_fin_estimada: string | null;
  dias_maximos: number; dias_utilizados: number; estado: string;
  estado_calculado: "por_iniciar" | "en_progreso" | "en_riesgo" | "vencido" | "completado";
  dias_transcurridos: number; dias_restantes: number;
  dias_para_iniciar: number; dias_vencido: number; porcentaje_dias: number;
  created_at: string; reportes: Reporte[];
}

interface Kpis { activos: number; pendientes: number; aprobados_mes: number; limite_dias: number; }
interface DashboardData { kpis: Kpis; pendientes: Reporte[]; proyectos: Proyecto[]; }
interface Empresa { id: string; nombre: string; contacto: string | null; telefono: string | null; correo: string | null; activo: boolean; }
interface UsuarioSub { id: string; nombre: string; usuario: string; correo: string | null; empresa_id: string; }
interface ActividadCatalogo { id: string; nombre: string; descripcion: string | null; }
interface ClienteItem { id: string; nombre_comercial: string; }

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(dateStr: string | null) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}
function tecnicosStr(r: Reporte) {
  const lista = r.tecnicos_presentes ?? [];
  if (lista.length > 0) return lista.map((t) => t.nombre).join(", ");
  if (r.cantidad_tecnicos) return `${r.cantidad_tecnicos} técnico(s)`;
  return "—";
}
function descStr(r: Reporte) { return r.descripcion || r.descripcion_trabajo || "Sin descripción"; }
function estadoBadge(estado: string) {
  const map: Record<string, string> = {
    pendiente: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    aprobado: "bg-green-500/15 text-green-400 border-green-500/30",
    rechazado: "bg-red-500/15 text-red-400 border-red-500/30",
    activo: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    completado: "bg-white/8 text-white/40 border-white/10",
    atrasado: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const label: Record<string, string> = {
    pendiente: "Pendiente", aprobado: "Aprobado", rechazado: "Rechazado",
    activo: "Activo", completado: "Completado", atrasado: "Atrasado",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${map[estado] ?? "bg-white/10 text-white/60 border-white/10"}`}>
      {label[estado] ?? estado}
    </span>
  );
}
function estadoCalculadoBadge(ec: Proyecto["estado_calculado"], diasParaIniciar?: number, diasVencido?: number) {
  const configs: Record<Proyecto["estado_calculado"], { label: string; cls: string; pulse: boolean }> = {
    por_iniciar: { label: diasParaIniciar !== undefined ? `Inicia en ${diasParaIniciar}d` : "Por iniciar", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30", pulse: false },
    en_progreso: { label: "En progreso", cls: "bg-green-500/15 text-green-400 border-green-500/30", pulse: false },
    en_riesgo:   { label: "En riesgo",   cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", pulse: true },
    vencido:     { label: diasVencido ? `Vencido +${diasVencido}d` : "Vencido", cls: "bg-red-500/15 text-red-400 border-red-500/30", pulse: true },
    completado:  { label: "Completado",  cls: "bg-white/8 text-white/40 border-white/10", pulse: false },
  };
  const cfg = configs[ec] ?? configs.en_progreso;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cfg.cls}`}>
      {cfg.pulse && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse shrink-0" />}
      {cfg.label}
    </span>
  );
}
function todayIso() { return new Date().toISOString().split("T")[0]!; }
function calcDiasHabiles(inicio: string, fin: string): number {
  let count = 0;
  const cur = new Date(inicio + "T12:00:00");
  const end = new Date(fin + "T12:00:00");
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(count, 1);
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-5 ${accent ? "border-[#CC0000]/40 bg-[#CC0000]/8" : "border-[#2A2A2A] bg-[#161616]"}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-[#666] mb-1">{label}</p>
          <p className={`text-3xl font-bold tabular-nums ${accent ? "text-[#CC0000]" : "text-white"}`}>{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${accent ? "bg-[#CC0000]/20" : "bg-white/5"}`}>
          <Icon className={`h-5 w-5 ${accent ? "text-[#CC0000]" : "text-[#666]"}`} />
        </div>
      </div>
    </div>
  );
}

// ─── Pending Approval Card ─────────────────────────────────────────────────────

function PendingCard({ reporte, onAction }: { reporte: Reporte; onAction: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [loading, setLoading] = useState<"aprobar" | "rechazar" | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  async function handleAprobar() {
    setLoading("aprobar");
    await fetch(`${API}/subcontratos/reporte/${reporte.id}/aprobar`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aprobado_por: "Supervisor TAS" }),
    });
    setLoading(null); onAction();
  }
  async function handleRechazar() {
    if (!motivo.trim()) return;
    setLoading("rechazar");
    await fetch(`${API}/subcontratos/reporte/${reporte.id}/rechazar`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario_rechazo: motivo.trim() }),
    });
    setLoading(null); onAction();
  }

  const p = reporte.proyecto;
  const pct = p?.porcentaje_dias ?? 0;
  const evidencia = reporte.fotos.filter((f) => f.tipo === "evidencia");

  return (
    <>
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="h-6 w-6" /></button>
          <img src={lightbox} alt="Foto" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
      <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="font-semibold text-white text-sm">{p?.nombre ?? "Proyecto"}</h3>
              <p className="text-xs text-[#666] mt-0.5">{p?.cliente_nombre ?? "—"}</p>
              {p?.supervisor_nombre && (
                <span className="inline-flex items-center gap-1 mt-1.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-semibold px-2.5 py-0.5">
                  👤 Supervisor: {p.supervisor_nombre}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">{estadoBadge(reporte.estado)}<span className="text-xs text-[#555]">{fmt(reporte.fecha)}</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2"><p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Técnicos</p><p className="text-xs text-white font-medium truncate">{tecnicosStr(reporte)}</p></div>
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2"><p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Actividad</p><p className="text-xs text-white font-medium truncate">{reporte.actividad_nombre ?? "—"}</p></div>
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2"><p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Avance</p><p className="text-xs text-white font-bold">{reporte.porcentaje_avance}%</p></div>
            <div className="rounded-lg bg-[#1E1E1E] px-3 py-2"><p className="text-[10px] text-[#555] uppercase tracking-wide mb-0.5">Días</p><p className={`text-xs font-bold ${pct >= 100 ? "text-[#8B0000]" : pct >= 90 ? "text-[#CC0000]" : pct >= 70 ? "text-yellow-400" : "text-white"}`}>{p?.dias_transcurridos ?? "—"} de {p?.dias_maximos ?? "—"} ({pct}%)</p></div>
          </div>
          <div className="mt-3 rounded-lg bg-[#1E1E1E] px-3 py-2"><p className="text-[10px] text-[#555] uppercase tracking-wide mb-1">Descripción</p><p className="text-xs text-[#C0C0C0] leading-relaxed">{descStr(reporte)}</p></div>
          {(reporte.foto_checkin_url || evidencia.length > 0) && (
            <div className="mt-3">
              <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Fotos</p>
              <div className="flex gap-2 flex-wrap">
                {reporte.foto_checkin_url && (<div className="relative"><img src={reporte.foto_checkin_url} alt="IN" className="h-16 w-16 rounded-lg object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(reporte.foto_checkin_url!)} /><span className="absolute bottom-0.5 left-0.5 rounded text-[8px] bg-black/70 text-white px-1">IN</span></div>)}
                {evidencia.map((f) => (<img key={f.id} src={f.url} alt="" className="h-16 w-16 rounded-lg object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(f.url)} />))}
                {reporte.foto_checkout_url && (<div className="relative"><img src={reporte.foto_checkout_url} alt="OUT" className="h-16 w-16 rounded-lg object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(reporte.foto_checkout_url!)} /><span className="absolute bottom-0.5 left-0.5 rounded text-[8px] bg-black/70 text-white px-1">OUT</span></div>)}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-[#2A2A2A] px-5 py-3">
          {!rejecting ? (
            <div className="flex gap-2">
              <button onClick={handleAprobar} disabled={!!loading} className="flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"><Check className="h-3.5 w-3.5" />{loading === "aprobar" ? "Aprobando..." : "✓ Aprobar"}</button>
              <button onClick={() => setRejecting(true)} disabled={!!loading} className="flex items-center gap-1.5 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-50 px-4 py-2 text-xs font-semibold text-white transition-colors"><X className="h-3.5 w-3.5" />✗ Rechazar</button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo del rechazo (requerido)..." rows={2} className="w-full rounded-lg border border-[#CC0000]/40 bg-[#1E1E1E] px-3 py-2 text-sm text-white placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 resize-none" />
              <div className="flex gap-2">
                <button onClick={handleRechazar} disabled={!motivo.trim() || !!loading} className="rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 px-4 py-2 text-xs font-semibold text-white transition-colors">{loading === "rechazar" ? "Rechazando..." : "Confirmar rechazo"}</button>
                <button onClick={() => { setRejecting(false); setMotivo(""); }} className="rounded-lg border border-[#2A2A2A] px-4 py-2 text-xs text-[#666] hover:text-white transition-colors">Cancelar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Edit Project Modal ────────────────────────────────────────────────────────

interface ActividadEdit { id?: string; nombre: string }

function EditarProyectoModal({ proyecto, onClose, onSaved }: { proyecto: Proyecto; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    fecha_inicio: proyecto.fecha_inicio ?? "",
    fecha_fin_estimada: proyecto.fecha_fin_estimada ?? "",
    dias_maximos: String(proyecto.dias_maximos),
    supervisor_id: proyecto.supervisor_id ?? "",
    supervisor_nombre: proyecto.supervisor_nombre ?? "",
    supervisor_correo: proyecto.supervisor_correo ?? "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [supervisoresTAS, setSupervisoresTAS] = useState<{ id: string; nombre: string; correo: string; rol: string }[]>([]);
  const [catalogo, setCatalogo] = useState<ActividadCatalogo[]>([]);
  const [actividades, setActividades] = useState<ActividadEdit[]>([]);
  const [actLoading, setActLoading] = useState(true);
  const [actSaving, setActSaving] = useState(false);
  const [actErr, setActErr] = useState<string | null>(null);
  const [actSuccess, setActSuccess] = useState(false);
  const [nuevaAct, setNuevaAct] = useState("");

  useEffect(() => {
    fetch(`${API}/dashboard/supervisores`).then((r) => r.json()).then((j) => setSupervisoresTAS(j.supervisores ?? []));
    Promise.all([
      fetch(`${API}/subcontratos/proyecto/${proyecto.id}/actividades`).then((r) => r.json()),
      fetch(`${API}/subcontratos/actividades-catalogo`).then((r) => r.json()),
    ]).then(([actRes, catRes]) => {
      setActividades((actRes.actividades ?? []).map((a: { id: string; nombre: string }) => ({ id: a.id, nombre: a.nombre })));
      setCatalogo(catRes.actividades ?? []);
    }).finally(() => setActLoading(false));
  }, [proyecto.id]);

  function handleChange(k: keyof typeof form, v: string) {
    const next = { ...form, [k]: v };
    if ((k === "fecha_inicio" || k === "fecha_fin_estimada") && next.fecha_inicio && next.fecha_fin_estimada) {
      next.dias_maximos = String(calcDiasHabiles(next.fecha_inicio, next.fecha_fin_estimada));
    }
    setForm(next);
  }

  async function handleSave() {
    setErr(null); setLoading(true);
    const res = await fetch(`${API}/subcontratos/proyecto/${proyecto.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, dias_maximos: Number(form.dias_maximos) }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.success) { onSaved(); onClose(); }
    else setErr(json.error ?? "Error al guardar");
  }

  async function handleSaveActividades() {
    if (actividades.length === 0) { setActErr("Agrega al menos una actividad"); return; }
    setActErr(null); setActSaving(true); setActSuccess(false);
    const res = await fetch(`${API}/subcontratos/proyecto/${proyecto.id}/actividades`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actividades }),
    });
    const json = await res.json();
    setActSaving(false);
    if (json.success) {
      setActividades((json.actividades ?? []).map((a: { id: string; nombre: string }) => ({ id: a.id, nombre: a.nombre })));
      setActSuccess(true);
      setTimeout(() => setActSuccess(false), 3000);
    } else {
      setActErr(json.error ?? "Error al guardar actividades");
    }
  }

  function addFromCatalogo(a: ActividadCatalogo) {
    if (actividades.some((x) => x.nombre === a.nombre)) return;
    setActividades((prev) => [...prev, { nombre: a.nombre }]);
    setActSuccess(false);
  }

  function addCustom() {
    const n = nuevaAct.trim();
    if (!n || actividades.some((x) => x.nombre === n)) return;
    setActividades((prev) => [...prev, { nombre: n }]);
    setNuevaAct("");
    setActSuccess(false);
  }

  function removeAct(idx: number) {
    setActividades((prev) => prev.filter((_, i) => i !== idx));
    setActSuccess(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#161616] rounded-xl border border-[#2A2A2A] overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <h2 className="font-semibold text-white flex items-center gap-2"><Pencil className="h-4 w-4 text-[#CC0000]" />Editar proyecto</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-[#666]">{proyecto.nombre}</p>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-xs text-[#666] mb-1">Fecha inicio</label><input type="date" value={form.fecha_inicio} onChange={(e) => handleChange("fecha_inicio", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" /></div>
            <div><label className="block text-xs text-[#666] mb-1">Fecha fin estimada</label><input type="date" value={form.fecha_fin_estimada} onChange={(e) => handleChange("fecha_fin_estimada", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" /></div>
          </div>
          <div><label className="block text-xs text-[#666] mb-1">Días máximos</label><input type="number" min={1} value={form.dias_maximos} onChange={(e) => setForm({ ...form, dias_maximos: e.target.value })} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" /></div>
          <div>
            <label className="block text-xs text-[#666] mb-1">Supervisor a cargo</label>
            <select
              value={form.supervisor_id}
              onChange={(e) => {
                const sup = supervisoresTAS.find((s) => s.id === e.target.value);
                setForm({ ...form, supervisor_id: e.target.value, supervisor_nombre: sup?.nombre ?? form.supervisor_nombre, supervisor_correo: sup?.correo ?? form.supervisor_correo });
              }}
              className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50"
            >
              {!form.supervisor_id && <option value="">{form.supervisor_nombre || "Seleccionar supervisor…"}</option>}
              {supervisoresTAS.map((s) => {
                const rolLabel: Record<string, string> = { supervisor: "Supervisor", gerente_operaciones: "Gerente Operaciones", admin: "Admin" };
                return <option key={s.id} value={s.id}>{s.nombre} — {rolLabel[s.rol] ?? s.rol}</option>;
              })}
            </select>
            {form.supervisor_correo && <p className="text-xs text-[#555] mt-1">✉ {form.supervisor_correo}</p>}
          </div>
          {err && <p className="text-xs text-red-400">{err}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={loading} className="flex-1 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-50 py-2.5 text-sm font-semibold text-white transition-colors">{loading ? "Guardando..." : "Guardar cambios"}</button>
            <button onClick={onClose} className="flex-1 rounded-lg border border-[#2A2A2A] py-2.5 text-sm text-[#666] hover:text-white transition-colors">Cancelar</button>
          </div>
        </div>

        {/* ── Actividades section ─────────────────────────────────────────── */}
        <div className="border-t border-[#2A2A2A] px-6 py-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#CC0000] uppercase tracking-widest">Actividades del proyecto</p>
            {actividades.length > 0 && (
              <span className="text-[10px] text-[#555]">{actividades.length} actividad{actividades.length !== 1 ? "es" : ""}</span>
            )}
          </div>

          {actLoading ? (
            <p className="text-xs text-[#555]">Cargando actividades…</p>
          ) : (
            <>
              {/* Current list */}
              {actividades.length === 0 ? (
                <p className="text-xs text-amber-400">⚠ Sin actividades — el subcontratista no podrá reportar avance</p>
              ) : (
                <div className="space-y-1.5">
                  {actividades.map((a, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] px-3 py-2">
                      <span className="text-sm text-white">{a.nombre}</span>
                      <div className="flex items-center gap-2">
                        {a.id && <span className="text-[10px] text-[#444]">existente</span>}
                        <button onClick={() => removeAct(i)} className="text-[#555] hover:text-red-400 transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add from catalog */}
              <div>
                <p className="text-[10px] text-[#555] mb-1.5 uppercase tracking-wide">Agregar del catálogo</p>
                <div className="flex flex-wrap gap-1.5">
                  {catalogo.filter((c) => !actividades.some((a) => a.nombre === c.nombre)).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => addFromCatalogo(c)}
                      className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-2.5 py-1 text-xs text-[#9A9A9A] hover:border-[#CC0000]/50 hover:text-white transition-colors flex items-center gap-1"
                    >
                      <Plus className="h-3 w-3" />{c.nombre}
                    </button>
                  ))}
                  {catalogo.every((c) => actividades.some((a) => a.nombre === c.nombre)) && (
                    <span className="text-[11px] text-[#444]">Todas las del catálogo ya están agregadas</span>
                  )}
                </div>
              </div>

              {/* Add custom */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={nuevaAct}
                  onChange={(e) => setNuevaAct(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustom(); }}
                  placeholder="Actividad personalizada…"
                  className="flex-1 bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#444] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50"
                />
                <button
                  onClick={addCustom}
                  disabled={!nuevaAct.trim()}
                  className="rounded-lg bg-[#2A2A2A] hover:bg-[#333] disabled:opacity-40 px-3 py-2 transition-colors"
                >
                  <Plus className="h-4 w-4 text-white" />
                </button>
              </div>

              {actErr && <p className="text-xs text-red-400">{actErr}</p>}
              {actSuccess && <p className="text-xs text-green-400">✓ Actividades guardadas correctamente</p>}

              <button
                onClick={handleSaveActividades}
                disabled={actSaving || actividades.length === 0}
                className="w-full rounded-lg border border-[#CC0000]/40 bg-[#CC0000]/10 text-[#CC0000] hover:bg-[#CC0000]/20 disabled:opacity-40 py-2 text-sm font-semibold transition-colors"
              >
                {actSaving ? "Guardando actividades…" : "Guardar actividades"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Deactivate Confirm Modal ─────────────────────────────────────────────────

function DesactivarModal({ proyecto, onClose, onDone }: { proyecto: Proyecto; onClose: () => void; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  async function confirm() {
    setLoading(true);
    await fetch(`${API}/subcontratos/proyecto/${proyecto.id}/desactivar`, { method: "PATCH" });
    setLoading(false); onDone(); onClose();
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#161616] rounded-xl border border-[#2A2A2A] p-6 space-y-4">
        <div className="flex items-center gap-3"><PowerOff className="h-5 w-5 text-[#CC0000]" /><h2 className="font-semibold text-white">Completar proyecto</h2></div>
        <p className="text-sm text-[#9A9A9A]">¿Marcar <strong className="text-white">{proyecto.nombre}</strong> como completado? Esta acción cambiará el estado y no podrán enviarse nuevos reportes.</p>
        <div className="flex gap-3">
          <button onClick={confirm} disabled={loading} className="flex-1 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-50 py-2.5 text-sm font-semibold text-white">{loading ? "Procesando..." : "Sí, completar"}</button>
          <button onClick={onClose} className="flex-1 rounded-lg border border-[#2A2A2A] py-2.5 text-sm text-[#666] hover:text-white">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Nuevo Proyecto Wizard ────────────────────────────────────────────────────

interface WizardForm {
  nombre: string; cliente_id: string; cliente_nombre: string; numero_proyecto: string;
  numero_llamada: string;
  fecha_inicio: string; fecha_fin_estimada: string; dias_maximos: string;
  empresa_id: string; usuario_id: string; usuario_nombre: string;
  usuario_usuario: string; usuario_correo: string;
  supervisor_id: string; supervisor_nombre: string; supervisor_correo: string;
  actividades: Array<{ id: string; nombre: string }>;
}

const EMPTY_FORM: WizardForm = {
  nombre: "", cliente_id: "", cliente_nombre: "", numero_proyecto: "",
  numero_llamada: "",
  fecha_inicio: todayIso(), fecha_fin_estimada: "", dias_maximos: "",
  empresa_id: "", usuario_id: "", usuario_nombre: "", usuario_usuario: "", usuario_correo: "",
  supervisor_id: "", supervisor_nombre: "", supervisor_correo: "",
  actividades: [],
};

function NuevoProyectoModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UsuarioSub[]>([]);
  const [catalogo, setCatalogo] = useState<ActividadCatalogo[]>([]);
  const [supervisoresTAS, setSupervisoresTAS] = useState<{ id: string; nombre: string; correo: string; rol: string }[]>([]);
  const [otrosChecked, setOtrosChecked] = useState(false);
  const [otrosText, setOtrosText] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/subcontratos/clientes-lista`).then((r) => r.json()),
      fetch(`${API}/subcontratos/empresas`).then((r) => r.json()),
      fetch(`${API}/subcontratos/actividades-catalogo`).then((r) => r.json()),
      fetch(`${API}/dashboard/supervisores`).then((r) => r.json()),
    ]).then(([c, e, a, sup]) => {
      setClientes(c.clientes ?? []);
      setEmpresas(e.empresas ?? []);
      setCatalogo(a.actividades ?? []);
      setSupervisoresTAS(sup.supervisores ?? []);
    });
  }, []);

  useEffect(() => {
    if (!form.empresa_id) { setUsuariosEmpresa([]); return; }
    fetch(`${API}/subcontratos/usuarios-empresa?empresa_id=${form.empresa_id}`)
      .then((r) => r.json()).then((j) => setUsuariosEmpresa(j.usuarios ?? []));
  }, [form.empresa_id]);

  function setField(k: keyof WizardForm, v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if ((k === "fecha_inicio" || k === "fecha_fin_estimada") && next.fecha_inicio && next.fecha_fin_estimada) {
        next.dias_maximos = String(calcDiasHabiles(next.fecha_inicio, next.fecha_fin_estimada));
      }
      return next;
    });
  }

  function toggleActividad(a: ActividadCatalogo) {
    setForm((f) => {
      const exists = f.actividades.find((x) => x.id === a.id);
      return {
        ...f,
        actividades: exists ? f.actividades.filter((x) => x.id !== a.id) : [...f.actividades, { id: a.id, nombre: a.nombre }],
      };
    });
  }

  function canNext(): boolean {
    if (step === 1) {
      if (!form.nombre.trim() || !form.cliente_nombre || !form.fecha_fin_estimada || !form.dias_maximos) return false;
      if (form.fecha_inicio && form.fecha_fin_estimada && new Date(form.fecha_fin_estimada) <= new Date(form.fecha_inicio)) return false;
      return true;
    }
    if (step === 2) return !!form.empresa_id && !!form.usuario_id && !!form.supervisor_id;
    if (step === 3) {
      const hasAny = form.actividades.length > 0 || otrosChecked;
      const otrosOk = !otrosChecked || !!otrosText.trim();
      return hasAny && otrosOk;
    }
    return true;
  }

  async function handleCreate() {
    setErr(null); setLoading(true);
    const finalActividades = [...form.actividades];
    if (otrosChecked && otrosText.trim()) {
      const otrosEntry = catalogo.find((a) => a.nombre === "Otros");
      finalActividades.push({ id: otrosEntry?.id ?? "otros", nombre: otrosText.trim() });
    }
    const res = await fetch(`${API}/subcontratos/proyecto`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, actividades: finalActividades, dias_maximos: Number(form.dias_maximos) }),
    });
    const json = await res.json();
    setLoading(false);
    if (json.success) { onCreated(); onClose(); }
    else setErr(json.error ?? "Error al crear proyecto");
  }

  const STEPS = ["Info del proyecto", "Subcontratista", "Actividades", "Confirmar"];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#161616] rounded-xl border border-[#2A2A2A] my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2A2A2A]">
          <div className="flex items-center gap-3">
            <Plus className="h-4 w-4 text-[#CC0000]" />
            <h2 className="font-semibold text-white">Nuevo Proyecto</h2>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex items-center gap-0">
            {STEPS.map((label, i) => {
              const n = (i + 1) as 1 | 2 | 3 | 4;
              const active = step === n;
              const done = step > n;
              return (
                <div key={n} className="flex items-center flex-1">
                  <div className={`flex items-center gap-2 shrink-0 ${active ? "text-white" : done ? "text-green-400" : "text-[#444]"}`}>
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${active ? "border-[#CC0000] bg-[#CC0000] text-white" : done ? "border-green-500 bg-green-500/20 text-green-400" : "border-[#2A2A2A] text-[#444]"}`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : n}
                    </div>
                    <span className="text-xs font-medium hidden sm:block">{label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${done ? "bg-green-500/30" : "bg-[#2A2A2A]"}`} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 pb-6 space-y-4">
          {/* Step 1 — Project Info */}
          {step === 1 && (
            <>
              <div><label className="block text-xs text-[#666] mb-1.5">Nombre del proyecto <span className="text-[#CC0000]">*</span></label><input value={form.nombre} onChange={(e) => setField("nombre", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 placeholder:text-[#444]" placeholder="Ej: Instalación CCTV Banco X" /></div>
              <div><label className="block text-xs text-[#666] mb-1.5">Cliente <span className="text-[#CC0000]">*</span></label>
                <select value={form.cliente_id} onChange={(e) => { const c = clientes.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, cliente_id: e.target.value, cliente_nombre: c?.nombre_comercial ?? "" })); }} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50">
                  <option value="">Seleccionar cliente…</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-[#666] mb-1.5">N° Proyecto SAP (opcional)</label><input value={form.numero_proyecto} onChange={(e) => setField("numero_proyecto", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 placeholder:text-[#444]" placeholder="P-2026-001" /></div>
                <div><label className="block text-xs text-[#666] mb-1.5">N° Llamada SAP (opcional)</label><input value={form.numero_llamada} onChange={(e) => setField("numero_llamada", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 placeholder:text-[#444]" placeholder="12345" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs text-[#666] mb-1.5">Fecha inicio <span className="text-[#CC0000]">*</span></label><input type="date" value={form.fecha_inicio} onChange={(e) => setField("fecha_inicio", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" /></div>
                <div><label className="block text-xs text-[#666] mb-1.5">Fecha fin estimada <span className="text-[#CC0000]">*</span></label><input type="date" value={form.fecha_fin_estimada} onChange={(e) => setField("fecha_fin_estimada", e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" /></div>
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Días máximos permitidos <span className="text-[#CC0000]">*</span></label>
                <input type="number" min={1} value={form.dias_maximos} onChange={(e) => setForm((f) => ({ ...f, dias_maximos: e.target.value }))} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" placeholder="Auto-calculado desde las fechas" />
                {form.fecha_inicio && form.fecha_fin_estimada && new Date(form.fecha_fin_estimada) > new Date(form.fecha_inicio) && (
                  <p className="text-xs text-blue-400 mt-1.5">📅 {calcDiasHabiles(form.fecha_inicio, form.fecha_fin_estimada)} días hábiles (lunes a viernes) entre las fechas seleccionadas</p>
                )}
                {form.fecha_inicio && form.fecha_fin_estimada && new Date(form.fecha_fin_estimada) <= new Date(form.fecha_inicio) && (
                  <p className="text-xs text-red-400 mt-1.5">⚠️ La fecha fin debe ser posterior a la fecha de inicio</p>
                )}
              </div>
            </>
          )}

          {/* Step 2 — Assign Subcontractor */}
          {step === 2 && (
            <>
              <div><label className="block text-xs text-[#666] mb-1.5">Empresa subcontratista <span className="text-[#CC0000]">*</span></label>
                <select value={form.empresa_id} onChange={(e) => { setField("empresa_id", e.target.value); setForm((f) => ({ ...f, empresa_id: e.target.value, usuario_id: "", usuario_nombre: "", usuario_usuario: "", usuario_correo: "" })); }} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50">
                  <option value="">Seleccionar empresa…</option>
                  {empresas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div><label className="block text-xs text-[#666] mb-1.5">Usuario subcontratista <span className="text-[#CC0000]">*</span></label>
                <select value={form.usuario_id} disabled={!form.empresa_id} onChange={(e) => { const u = usuariosEmpresa.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, usuario_id: e.target.value, usuario_nombre: u?.nombre ?? "", usuario_usuario: u?.usuario ?? "", usuario_correo: u?.correo ?? "" })); }} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50 disabled:opacity-40">
                  <option value="">Seleccionar usuario…</option>
                  {usuariosEmpresa.map((u) => <option key={u.id} value={u.id}>{u.nombre} (@{u.usuario})</option>)}
                </select>
                {form.empresa_id && usuariosEmpresa.length === 0 && <p className="text-xs text-[#666] mt-1">No hay usuarios registrados para esta empresa.</p>}
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Supervisor a cargo <span className="text-[#CC0000]">*</span></label>
                <select
                  value={form.supervisor_id}
                  onChange={(e) => {
                    const sup = supervisoresTAS.find((s) => s.id === e.target.value);
                    setForm((f) => ({
                      ...f,
                      supervisor_id: e.target.value,
                      supervisor_nombre: sup?.nombre ?? "",
                      supervisor_correo: sup?.correo ?? "",
                    }));
                  }}
                  className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50"
                >
                  <option value="">Seleccionar supervisor TAS…</option>
                  {supervisoresTAS.map((s) => {
                    const rolLabel: Record<string, string> = { supervisor: "Supervisor", gerente_operaciones: "Gerente Operaciones", admin: "Admin" };
                    return <option key={s.id} value={s.id}>{s.nombre} — {rolLabel[s.rol] ?? s.rol}</option>;
                  })}
                </select>
                {form.supervisor_correo && (
                  <p className="text-xs text-[#555] mt-1.5">✉ {form.supervisor_correo}</p>
                )}
              </div>
            </>
          )}

          {/* Step 3 — Activities */}
          {step === 3 && (
            <div>
              <p className="text-xs text-[#666] mb-3">Selecciona las actividades que aplican a este proyecto. Se usarán para registrar el progreso. <span className="text-[#CC0000]">Mínimo 1 requerida.</span></p>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {catalogo.filter((a) => a.nombre !== "Otros").map((a) => {
                  const selected = !!form.actividades.find((x) => x.id === a.id);
                  return (
                    <button key={a.id} onClick={() => toggleActividad(a)} className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${selected ? "border-[#CC0000]/50 bg-[#CC0000]/8 text-white" : "border-[#2A2A2A] bg-[#1E1E1E] text-[#9A9A9A] hover:border-[#3A3A3A]"}`}>
                      <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${selected ? "border-[#CC0000] bg-[#CC0000]" : "border-[#3A3A3A]"}`}>{selected && <Check className="h-2.5 w-2.5 text-white" />}</div>
                      <span className="text-sm font-medium">{a.nombre}</span>
                    </button>
                  );
                })}
              </div>
              {/* Otros — special custom activity */}
              <div className="mt-2 border-t border-[#2A2A2A] pt-2">
                <button
                  onClick={() => { setOtrosChecked((v) => !v); if (otrosChecked) setOtrosText(""); }}
                  className={`w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${otrosChecked ? "border-[#CC0000]/50 bg-[#CC0000]/8 text-white" : "border-[#2A2A2A] bg-[#1E1E1E] text-[#9A9A9A] hover:border-[#3A3A3A]"}`}
                >
                  <div className={`h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center ${otrosChecked ? "border-[#CC0000] bg-[#CC0000]" : "border-[#3A3A3A]"}`}>
                    {otrosChecked && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="text-sm font-medium">Otros</span>
                  <span className="ml-auto text-[10px] text-[#555]">Actividad personalizada</span>
                </button>
                {otrosChecked && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={otrosText}
                      onChange={(e) => setOtrosText(e.target.value)}
                      placeholder="Describe la actividad..."
                      className="w-full bg-[#1E1E1E] border border-[#CC0000]/40 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50"
                      autoFocus
                    />
                    {!otrosText.trim() && (
                      <p className="text-[10px] text-amber-400 mt-1">⚠️ Describe la actividad para continuar</p>
                    )}
                  </div>
                )}
              </div>
              {(form.actividades.length + (otrosChecked ? 1 : 0)) > 0 && (
                <p className="text-xs text-green-400 mt-2">{form.actividades.length + (otrosChecked ? 1 : 0)} actividad(es) seleccionada(s)</p>
              )}
            </div>
          )}

          {/* Step 4 — Review */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] p-4 space-y-2">
                <p className="text-[10px] text-[#555] uppercase tracking-widest font-semibold mb-2">Proyecto</p>
                <Row label="Nombre" val={form.nombre} />
                <Row label="Cliente" val={form.cliente_nombre} />
                {form.numero_proyecto && <Row label="N° SAP" val={form.numero_proyecto} />}
                <Row label="Inicio" val={fmt(form.fecha_inicio)} />
                <Row label="Fin estimado" val={fmt(form.fecha_fin_estimada)} />
                <Row label="Días máximos" val={`${form.dias_maximos} días`} accent />
              </div>
              <div className="rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] p-4 space-y-2">
                <p className="text-[10px] text-[#555] uppercase tracking-widest font-semibold mb-2">Subcontratista</p>
                <Row label="Empresa" val={empresas.find((e) => e.id === form.empresa_id)?.nombre ?? "—"} />
                <Row label="Usuario" val={`${form.usuario_nombre} (@${form.usuario_usuario})`} />
                <Row label="Supervisor" val={form.supervisor_nombre} />
                {form.supervisor_correo && <Row label="Correo supervisor" val={form.supervisor_correo} />}
                {form.usuario_correo && <Row label="Email notificación" val={form.usuario_correo} accent />}
              </div>
              <div className="rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] p-4">
                <p className="text-[10px] text-[#555] uppercase tracking-widest font-semibold mb-2">Actividades ({form.actividades.length + (otrosChecked && otrosText.trim() ? 1 : 0)})</p>
                <div className="flex flex-wrap gap-1.5">
                  {form.actividades.map((a) => <span key={a.id} className="rounded-full bg-[#CC0000]/10 border border-[#CC0000]/30 text-[#CC0000] text-xs px-2 py-0.5">{a.nombre}</span>)}
                  {otrosChecked && otrosText.trim() && (
                    <span className="rounded-full bg-[#CC0000]/10 border border-[#CC0000]/30 text-[#CC0000] text-xs px-2 py-0.5">{otrosText.trim()}</span>
                  )}
                </div>
              </div>
              {form.usuario_correo && <p className="text-xs text-[#666] flex items-start gap-1.5"><span className="text-green-400 mt-0.5">✉</span>Se enviará un correo a <strong className="text-[#9A9A9A]">{form.usuario_correo}</strong> con los detalles del proyecto.</p>}
              {err && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">{err}</p>}
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 pt-4 border-t border-[#2A2A2A]">
            {step > 1 && <button onClick={() => setStep((s) => (s - 1) as typeof step)} className="rounded-lg border border-[#2A2A2A] px-5 py-2.5 text-sm text-[#666] hover:text-white transition-colors">← Atrás</button>}
            <div className="flex-1" />
            {step < 4 ? (
              <button onClick={() => { if (canNext()) setStep((s) => (s + 1) as typeof step); }} disabled={!canNext()} className="rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-40 px-6 py-2.5 text-sm font-semibold text-white transition-colors">Siguiente →</button>
            ) : (
              <button onClick={handleCreate} disabled={loading} className="rounded-lg bg-[#CC0000] hover:bg-[#AA0000] disabled:opacity-50 px-8 py-2.5 text-sm font-semibold text-white transition-colors">{loading ? "Creando…" : "✓ Crear proyecto"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, val, accent }: { label: string; val: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4"><span className="text-xs text-[#555] shrink-0">{label}</span><span className={`text-xs font-medium text-right ${accent ? "text-[#CC0000]" : "text-[#C0C0C0]"}`}>{val}</span></div>
  );
}

// ─── Project Row ──────────────────────────────────────────────────────────────

function ProyectoRow({ proyecto, selected, onClick, onEdit, onDeactivate }: {
  proyecto: Proyecto; selected: boolean; onClick: () => void;
  onEdit: (p: Proyecto) => void; onDeactivate: (p: Proyecto) => void;
}) {
  const ec = proyecto.estado_calculado;
  const pct = proyecto.porcentaje_dias ?? 0;
  const barColor = ec === "vencido" ? "#8B0000" : ec === "en_riesgo" ? "#F59E0B" : ec === "por_iniciar" ? "#1D4ED8" : ec === "completado" ? "#3A3A3A" : "#22C55E";
  const reportes = proyecto.reportes ?? [];
  const aprobados = reportes.filter((r) => r.estado === "aprobado").length;
  const totalAvance = reportes.length > 0 ? Math.round(reportes.reduce((s, r) => s + (r.porcentaje_avance ?? 0), 0) / reportes.length) : 0;

  function DaysCell() {
    if (ec === "por_iniciar") {
      return <div className="text-xs text-blue-400">🗓️ Inicia en {proyecto.dias_para_iniciar}d</div>;
    }
    if (ec === "vencido") {
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden"><div className="h-full rounded-full" style={{ width: "100%", background: "#8B0000" }} /></div>
          <span className="text-xs tabular-nums text-[#CC0000] w-16 text-right">+{proyecto.dias_vencido}d!</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} /></div>
        <span className="text-xs tabular-nums text-[#9A9A9A] w-16 text-right">{proyecto.dias_transcurridos}/{proyecto.dias_maximos}d ({proyecto.dias_restantes}r)</span>
      </div>
    );
  }

  return (
    <tr className={`border-b border-[#2A2A2A] transition-colors ${selected ? "bg-[#CC0000]/8" : "hover:bg-white/3"}`}>
      <td className="px-4 py-3 cursor-pointer" onClick={onClick}>
        <div className="font-medium text-sm text-white">{proyecto.nombre}</div>
        <div className="text-xs text-[#555] mt-0.5">{proyecto.cliente_nombre}</div>
        {proyecto.supervisor_nombre && (
          <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[9px] font-semibold px-2 py-0.5">
            👤 {proyecto.supervisor_nombre.split(" ").slice(0, 2).join(" ")}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-[#9A9A9A] cursor-pointer" onClick={onClick}>TAS</td>
      <td className="px-4 py-3 min-w-[160px] cursor-pointer" onClick={onClick}><DaysCell /></td>
      <td className="px-4 py-3 text-xs text-[#9A9A9A] tabular-nums cursor-pointer" onClick={onClick}>{totalAvance}%</td>
      <td className="px-4 py-3 cursor-pointer" onClick={onClick}>{estadoCalculadoBadge(ec, proyecto.dias_para_iniciar, proyecto.dias_vencido)}</td>
      <td className="px-4 py-3 text-xs text-[#555] tabular-nums cursor-pointer" onClick={onClick}>{reportes.length} ({aprobados} aprob.)</td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5">
          <button title="Editar" onClick={(e) => { e.stopPropagation(); onEdit(proyecto); }} className="rounded-lg border border-[#2A2A2A] p-1.5 text-[#555] hover:text-white hover:border-[#3A3A3A] transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
          {ec !== "completado" && <button title="Completar" onClick={(e) => { e.stopPropagation(); onDeactivate(proyecto); }} className="rounded-lg border border-[#2A2A2A] p-1.5 text-[#555] hover:text-[#CC0000] hover:border-[#CC0000]/40 transition-colors"><PowerOff className="h-3.5 w-3.5" /></button>}
        </div>
      </td>
    </tr>
  );
}

// ─── Timeline Panel ───────────────────────────────────────────────────────────

function TimelinePanel({ proyecto, onClose }: { proyecto: Proyecto; onClose: () => void }) {
  const reportes = [...(proyecto.reportes ?? [])].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  return (
    <>
      {lightbox && (<div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}><button className="absolute top-4 right-4 text-white/60 hover:text-white"><X className="h-6 w-6" /></button><img src={lightbox} alt="" className="max-h-[90vh] max-w-full rounded-lg object-contain" /></div>)}
      <div className="rounded-xl border border-[#CC0000]/30 bg-[#161616] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2A2A2A]">
          <div><h3 className="font-semibold text-white">{proyecto.nombre}</h3><p className="text-xs text-[#666]">{proyecto.cliente_nombre} · {reportes.length} reporte(s)</p></div>
          <button onClick={onClose} className="text-[#555] hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {reportes.length === 0 && <p className="text-center text-sm text-[#555] py-8">Sin reportes registrados</p>}
          {reportes.map((r, i) => {
            const isOpen = expanded === r.id;
            const evidencia = (r.fotos ?? []).filter((f) => f.tipo === "evidencia");
            return (
              <div key={r.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`h-3 w-3 rounded-full border-2 mt-1 shrink-0 ${r.estado === "aprobado" ? "bg-green-500 border-green-500" : r.estado === "rechazado" ? "bg-red-500 border-red-500" : "bg-yellow-400 border-yellow-400"}`} />
                  {i < reportes.length - 1 && <div className="w-px flex-1 bg-[#2A2A2A] my-1" />}
                </div>
                <div className="flex-1 pb-2">
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="w-full text-left rounded-lg border border-[#2A2A2A] bg-[#1E1E1E] px-3 py-2.5 hover:border-[#3A3A3A] transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold text-white">{fmt(r.fecha)}</span>{estadoBadge(r.estado)}<span className="text-xs text-[#555]">{r.porcentaje_avance}% avance</span></div>
                      {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-[#555] shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-[#555] shrink-0" />}
                    </div>
                    {r.actividad_nombre && <p className="text-xs text-[#666] mt-0.5">{r.actividad_nombre}</p>}
                  </button>
                  {isOpen && (
                    <div className="mt-2 rounded-lg border border-[#2A2A2A] bg-[#131313] px-3 py-3 space-y-2.5">
                      {/* Project info */}
                      <div className="flex items-start gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white">{proyecto.nombre}</p>
                          <p className="text-[11px] text-[#555]">{proyecto.cliente_nombre}</p>
                        </div>
                      </div>

                      {/* Times */}
                      {(r.hora_entrada || r.hora_salida) && (
                        <div className="flex items-center gap-1.5 text-[11px] text-[#9A9A9A]">
                          <span className="text-[#555]">Horario:</span>
                          <span className="font-mono">{r.hora_entrada ?? "—"}</span>
                          <span className="text-[#555]">→</span>
                          <span className="font-mono">{r.hora_salida ?? "—"}</span>
                        </div>
                      )}

                      {/* Activity + progress */}
                      {r.actividad_nombre && (
                        <div className="flex items-center gap-1.5 text-[11px]">
                          <span className="text-[#555]">Actividad:</span>
                          <span className="text-[#9A9A9A]">{r.actividad_nombre}</span>
                        </div>
                      )}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-[#555]">Avance hoy:</span>
                          <span className="text-white font-bold">{r.porcentaje_avance}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[#2A2A2A] overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(r.porcentaje_avance, 100)}%` }} />
                        </div>
                        {r.porcentaje_acumulado !== null && r.porcentaje_acumulado !== undefined && (
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-[#555]">Acumulado total:</span>
                            <span className="text-amber-400 font-bold">{r.porcentaje_acumulado}%</span>
                          </div>
                        )}
                      </div>

                      {/* Technicians */}
                      <div>
                        <p className="text-[11px] text-[#555] mb-1">
                          Técnicos ({r.cantidad_tecnicos ?? (r.tecnicos_presentes?.length ?? 0)}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {(r.tecnicos_presentes ?? []).map((t, idx) => (
                            <span key={idx} className="inline-flex rounded-full bg-[#2A2A2A] text-[#9A9A9A] text-[10px] px-2 py-0.5">{t.nombre}</span>
                          ))}
                          {(!r.tecnicos_presentes || r.tecnicos_presentes.length === 0) && r.cantidad_tecnicos && (
                            <span className="text-[11px] text-[#9A9A9A]">{r.cantidad_tecnicos} técnico(s)</span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <p className="text-[11px] text-[#555] mb-0.5">Descripción:</p>
                        <p className="text-xs text-[#9A9A9A] leading-relaxed">{descStr(r)}</p>
                      </div>

                      {r.comentario_rechazo && (
                        <p className="text-xs text-red-400 bg-red-500/8 border border-red-500/20 rounded px-2 py-1.5">
                          <span className="text-[#555]">Motivo rechazo: </span>{r.comentario_rechazo}
                        </p>
                      )}

                      {/* Photos */}
                      {(r.foto_checkin_url || evidencia.length > 0 || r.foto_checkout_url) && (
                        <div>
                          <p className="text-[11px] text-[#555] mb-1.5">Fotos:</p>
                          <div className="flex gap-1.5 flex-wrap">
                            {r.foto_checkin_url && (
                              <div className="relative">
                                <img src={r.foto_checkin_url} alt="IN" className="h-16 w-16 rounded object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(r.foto_checkin_url!)} />
                                <span className="absolute bottom-0.5 left-0.5 rounded text-[8px] bg-black/70 text-white px-1">IN</span>
                              </div>
                            )}
                            {evidencia.map((f) => (
                              <img key={f.id} src={f.url} alt="" className="h-16 w-16 rounded object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(f.url)} />
                            ))}
                            {r.foto_checkout_url && (
                              <div className="relative">
                                <img src={r.foto_checkout_url} alt="OUT" className="h-16 w-16 rounded object-cover cursor-pointer border border-[#2A2A2A]" onClick={() => setLightbox(r.foto_checkout_url!)} />
                                <span className="absolute bottom-0.5 left-0.5 rounded text-[8px] bg-black/70 text-white px-1">OUT</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Supervisor Stats Section ─────────────────────────────────────────────────

interface SupStat {
  id: string;
  nombre: string;
  boletas_asignadas: number;
  boletas_pendientes: number;
  avg_revision_minutos: number | null;
  subcontratos_activos: number;
  pendientes_aprobacion: number;
}

function fmtMins(m: number | null): string {
  if (m === null || m === undefined) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); const min = m % 60;
  return min > 0 ? `${h}h ${min}m` : `${h}h`;
}

function SupervisoresSection({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const [sups, setSups] = useState<SupStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`${API}/revision/supervisor-stats`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { supervisores?: SupStat[] }) => setSups(json.supervisores ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="h-24 rounded-xl bg-[#161616] border border-[#2A2A2A] animate-pulse" />;
  if (sups.length === 0) return null;

  const withTime = sups.filter((s) => s.avg_revision_minutos !== null);
  const bestRendimiento = [...withTime].sort((a, b) => (a.avg_revision_minutos ?? 999) - (b.avg_revision_minutos ?? 999))[0];
  const masBoletas = [...sups].sort((a, b) => b.boletas_asignadas - a.boletas_asignadas)[0];
  const masSubcontratos = [...sups].sort((a, b) => b.subcontratos_activos - a.subcontratos_activos)[0];
  const avgTiempoTotal = withTime.length > 0
    ? Math.round(withTime.reduce((s, x) => s + (x.avg_revision_minutos ?? 0), 0) / withTime.length)
    : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-400" />
          <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest">Supervisores</h2>
          {selectedId && (
            <button onClick={() => onSelect(null)} className="flex items-center gap-1 rounded-full bg-[#CC0000]/15 text-[#CC0000] border border-[#CC0000]/30 px-2 py-0.5 text-[10px] font-semibold hover:bg-[#CC0000]/25 transition-colors">
              <X className="h-2.5 w-2.5" />{sups.find((s) => s.id === selectedId)?.nombre.split(" ")[0]} ×
            </button>
          )}
        </div>
        <button onClick={() => setExpanded((v) => !v)} className="text-[10px] text-[#555] hover:text-white transition-colors flex items-center gap-1">
          {expanded ? "Ocultar" : "Ver comparación"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* 4 KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Mejor rendimiento</p>
          <p className="text-sm font-bold text-green-400 truncate">{bestRendimiento?.nombre.split(" ").slice(0, 2).join(" ") ?? "—"}</p>
          {bestRendimiento && <p className="text-[10px] text-[#555] mt-0.5">{fmtMins(bestRendimiento.avg_revision_minutos)} prom.</p>}
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Más boletas asignadas</p>
          <p className="text-sm font-bold text-white truncate">{masBoletas?.nombre.split(" ").slice(0, 2).join(" ") ?? "—"}</p>
          {masBoletas && <p className="text-[10px] text-[#555] mt-0.5">{masBoletas.boletas_asignadas} boletas</p>}
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Más subcontratos</p>
          <p className="text-sm font-bold text-white truncate">{masSubcontratos?.nombre.split(" ").slice(0, 2).join(" ") ?? "—"}</p>
          {masSubcontratos && <p className="text-[10px] text-[#555] mt-0.5">{masSubcontratos.subcontratos_activos} activos</p>}
        </div>
        <div className="rounded-xl border border-[#2A2A2A] bg-[#1C1C1C] p-4">
          <p className="text-[10px] text-[#555] uppercase tracking-wide mb-2">Tiempo prom. aprobación</p>
          <p className="text-2xl font-bold text-white">{fmtMins(avgTiempoTotal)}</p>
          <p className="text-[10px] text-[#555] mt-0.5">todos los supervisores</p>
        </div>
      </div>

      {/* Comparison table */}
      {expanded && (
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#2A2A2A]">
                  {["Supervisor", "Boletas asignadas", "Boletas pendientes", "Tiempo prom.", "Subcontratos activos", "Pend. aprobación"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-[#555] uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C1C1C]">
                {sups.map((s) => (
                  <tr key={s.id} onClick={() => onSelect(selectedId === s.id ? null : s.id)} className={`cursor-pointer transition-colors ${selectedId === s.id ? "bg-[#CC0000]/10" : "hover:bg-white/[0.02]"}`}>
                    <td className="px-3 py-2.5 text-white font-medium">{s.nombre}</td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">{s.boletas_asignadas}</td>
                    <td className="px-3 py-2.5"><span className={s.boletas_pendientes > 0 ? "text-amber-400 font-semibold" : "text-[#555]"}>{s.boletas_pendientes}</span></td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">{fmtMins(s.avg_revision_minutos)}</td>
                    <td className="px-3 py-2.5 text-[#9A9A9A]">{s.subcontratos_activos}</td>
                    <td className="px-3 py-2.5"><span className={s.pendientes_aprobacion > 0 ? "text-amber-400 font-semibold" : "text-[#555]"}>{s.pendientes_aprobacion}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SubcontratosDashboard() {
  const { usuario } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Proyecto | null>(null);
  const [editProject, setEditProject] = useState<Proyecto | null>(null);
  const [deactivateProject, setDeactivateProject] = useState<Proyecto | null>(null);
  const [showNuevo, setShowNuevo] = useState(false);

  // Filters
  const [filterEstado, setFilterEstado] = useState("");
  const [filterFechaDesde, setFilterFechaDesde] = useState("");
  const [filterFechaHasta, setFilterFechaHasta] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterSupervisorId, setFilterSupervisorId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (usuario?.rol === "supervisor" && usuario.id) {
        params.set("supervisor_id", usuario.id);
        params.set("rol", "supervisor");
      }
      const res = await fetch(`${API}/subcontratos/dashboard?${params}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        if (selectedProject) {
          const updated = json.proyectos.find((p: Proyecto) => p.id === selectedProject.id);
          if (updated) setSelectedProject(updated);
        }
      } else setError(json.error ?? "Error al cargar datos");
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }, [usuario]);

  useEffect(() => { load(); }, [load]);

  const filteredProyectos = useMemo(() => {
    if (!data) return [];
    return data.proyectos.filter((p) => {
      if (filterEstado && p.estado_calculado !== filterEstado) return false;
      if (filterFechaDesde && p.fecha_inicio && p.fecha_inicio < filterFechaDesde) return false;
      if (filterFechaHasta && p.fecha_fin_estimada && p.fecha_fin_estimada > filterFechaHasta) return false;
      if (filterSupervisorId && p.supervisor_id !== filterSupervisorId) return false;
      return true;
    });
  }, [data, filterEstado, filterFechaDesde, filterFechaHasta, filterSupervisorId]);

  const activeFilters = [filterEstado, filterFechaDesde, filterFechaHasta].filter(Boolean).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      <DashboardNav />

      <div className="mx-auto w-full max-w-[1280px] px-4 py-6 space-y-8">
        {loading && <div className="flex items-center justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CC0000] border-t-transparent" /></div>}
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400">{error}</div>}

        {data && (
          <>
            {/* Section header with actions */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h1 className="text-lg font-bold text-white">Dashboard de Subcontratos</h1>
              <div className="flex gap-2">
                <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${showFilters || activeFilters > 0 ? "border-[#CC0000]/40 text-[#CC0000]" : "border-[#2A2A2A] text-[#666] hover:text-white"}`}>
                  <Filter className="h-3.5 w-3.5" />Filtros{activeFilters > 0 && <span className="rounded-full bg-[#CC0000] px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilters}</span>}
                </button>
                <button onClick={() => setShowNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-[#CC0000] hover:bg-[#AA0000] px-4 py-2 text-xs font-semibold text-white transition-colors"><Plus className="h-3.5 w-3.5" />Nuevo Proyecto</button>
              </div>
            </div>

            {/* Filters panel */}
            {showFilters && (
              <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs text-[#666] mb-1.5">Estado</label>
                    <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50">
                      <option value="">Todos</option>
                      <option value="por_iniciar">Por iniciar</option>
                      <option value="en_progreso">En progreso</option>
                      <option value="en_riesgo">En riesgo</option>
                      <option value="vencido">Vencido</option>
                      <option value="completado">Completado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-[#666] mb-1.5">Fecha inicio desde</label>
                    <input type="date" value={filterFechaDesde} onChange={(e) => setFilterFechaDesde(e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#666] mb-1.5">Fecha fin hasta</label>
                    <input type="date" value={filterFechaHasta} onChange={(e) => setFilterFechaHasta(e.target.value)} className="w-full bg-[#1E1E1E] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#CC0000]/50" />
                  </div>
                </div>
                {activeFilters > 0 && (
                  <button onClick={() => { setFilterEstado(""); setFilterFechaDesde(""); setFilterFechaHasta(""); }} className="mt-3 text-xs text-[#CC0000] hover:text-red-400 transition-colors">✕ Limpiar filtros</button>
                )}
              </div>
            )}

            {/* Section 1 — Supervisor KPIs */}
            <SupervisoresSection selectedId={filterSupervisorId} onSelect={setFilterSupervisorId} />

            {/* KPIs */}
            <section>
              <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                <KpiCard label="Proyectos activos" value={data.kpis.activos} icon={FolderOpen} />
                <KpiCard label="Pendientes de aprobación" value={data.kpis.pendientes} icon={Clock} accent={data.kpis.pendientes > 0} />
                <KpiCard label="Aprobados este mes" value={data.kpis.aprobados_mes} icon={CheckCircle} />
                <KpiCard label="Proyectos al límite (>90%)" value={data.kpis.limite_dias} icon={AlertTriangle} accent={data.kpis.limite_dias > 0} />
              </div>
            </section>

            {/* Pending Approvals */}
            <section>
              <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-400" />Pendientes de aprobación
                {data.kpis.pendientes > 0 && <span className="rounded-full bg-[#CC0000] px-2 py-0.5 text-[10px] font-bold text-white">{data.kpis.pendientes}</span>}
              </h2>
              {data.pendientes.length === 0 ? (
                <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] px-6 py-10 text-center"><CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2 opacity-60" /><p className="text-sm text-[#555]">Sin reportes pendientes de aprobación</p></div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">{data.pendientes.map((r) => <PendingCard key={r.id} reporte={r} onAction={load} />)}</div>
              )}
            </section>

            {/* Por iniciar */}
            {data.proyectos.filter((p) => p.estado_calculado === "por_iniciar").length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  Por iniciar — proyectos próximos
                  <span className="rounded-full bg-blue-500/20 text-blue-400 px-2 py-0.5 text-[10px] font-bold">{data.proyectos.filter((p) => p.estado_calculado === "por_iniciar").length}</span>
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {data.proyectos.filter((p) => p.estado_calculado === "por_iniciar").map((p) => (
                    <div key={p.id} className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm text-white leading-tight">{p.nombre}</p>
                        {estadoCalculadoBadge("por_iniciar", p.dias_para_iniciar)}
                      </div>
                      <p className="text-xs text-[#555]">{p.cliente_nombre}</p>
                      {p.supervisor_nombre && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-semibold px-2.5 py-0.5">
                          👤 {p.supervisor_nombre}
                        </span>
                      )}
                      {p.fecha_inicio && (
                        <p className="text-xs text-blue-400 font-medium">
                          🗓️ {new Date(p.fecha_inicio).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })}
                        </p>
                      )}
                      <p className="text-xs text-[#444] italic">Prepara tu equipo — el proyecto comienza pronto.</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Projects Table */}
            <section>
              <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest mb-4 flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-[#666]" />
                Proyectos {filterEstado || filterFechaDesde || filterFechaHasta ? `— ${filteredProyectos.length} filtrado(s)` : `— ${data.proyectos.length} total`}
              </h2>
              <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#2A2A2A]">
                        {["Proyecto / Cliente", "Empresa", "Días (barra)", "% Avance", "Estado", "Reportes", "Acciones"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest text-[#555] font-semibold">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProyectos.map((p) => (
                        <ProyectoRow
                          key={p.id} proyecto={p}
                          selected={selectedProject?.id === p.id}
                          onClick={() => setSelectedProject(selectedProject?.id === p.id ? null : p)}
                          onEdit={setEditProject}
                          onDeactivate={setDeactivateProject}
                        />
                      ))}
                      {filteredProyectos.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-[#555]">Sin proyectos{activeFilters > 0 ? " que coincidan con los filtros" : " registrados"}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* Timeline */}
            {selectedProject && (
              <section>
                <h2 className="text-sm font-semibold text-[#9A9A9A] uppercase tracking-widest mb-4 flex items-center gap-2"><Calendar className="h-4 w-4 text-[#666]" />Timeline — {selectedProject.nombre}</h2>
                <TimelinePanel proyecto={selectedProject} onClose={() => setSelectedProject(null)} />
              </section>
            )}
          </>
        )}

        {/* ── Informational note about company management ────────────────────── */}
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] px-5 py-4 flex items-start gap-3">
          <Info className="h-4 w-4 text-[#555] shrink-0 mt-0.5" />
          <p className="text-sm text-[#666]">
            Para gestionar empresas y usuarios subcontratistas, accede a{" "}
            {(usuario?.rol === "admin" || usuario?.rol === "gerente_operaciones") ? (
              <a href={`${import.meta.env.BASE_URL}gestion/subcontratos`} className="text-[#7C3AED] hover:text-[#A78BFA] font-semibold transition-colors">
                Gestión → Subcontratos
              </a>
            ) : (
              <span className="text-[#9A9A9A] font-semibold">Gestión → Subcontratos</span>
            )}
            .
          </p>
        </div>

        <div className="h-12" />
      </div>

      {/* Modals */}
      {showNuevo && <NuevoProyectoModal onClose={() => setShowNuevo(false)} onCreated={load} />}
      {editProject && <EditarProyectoModal proyecto={editProject} onClose={() => setEditProject(null)} onSaved={load} />}
      {deactivateProject && <DesactivarModal proyecto={deactivateProject} onClose={() => setDeactivateProject(null)} onDone={load} />}
    </div>
  );
}
