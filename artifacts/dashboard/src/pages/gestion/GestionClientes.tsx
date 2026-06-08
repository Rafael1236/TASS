import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Check, Loader2, Pencil, BookOpen } from "lucide-react";

const API = `${window.location.origin}/api`;

const SEGMENTOS = ["Residencial", "Comercial", "Gobierno", "Industrial", "Educación", "Salud"];

interface Cliente {
  id: string;
  nombre_comercial: string;
  codigo_sn: string | null;
  correo: string | null;
  nit: string | null;
  telefono: string | null;
  direccion: string | null;
  persona_contacto: string | null;
  cargo_contacto: string | null;
  facturar_a_nombre_de: string | null;
  vendedor_asignado: string | null;
  segmento: string | null;
  sitio_web: string | null;
  notas_internas: string | null;
  fecha_ultimo_contacto: string | null;
  registro_fiscal: string | null;
  ultima_visita: string | null;
}

interface Boleta { id: string; numero_reporte: number; created_at: string; tecnico_nombre: string | null; estado_servicio: string | null; }

interface CForm {
  nombre_comercial: string;
  codigo_sn: string;
  nit: string;
  registro_fiscal: string;
  correo: string;
  telefono: string;
  direccion: string;
  persona_contacto: string;
  cargo_contacto: string;
  facturar_a_nombre_de: string;
  vendedor_asignado: string;
  segmento: string;
  sitio_web: string;
  notas_internas: string;
  fecha_ultimo_contacto: string;
}

const EMPTY_FORM: CForm = {
  nombre_comercial: "", codigo_sn: "", nit: "", registro_fiscal: "",
  correo: "", telefono: "", direccion: "", persona_contacto: "",
  cargo_contacto: "", facturar_a_nombre_de: "", vendedor_asignado: "",
  segmento: "", sitio_web: "", notas_internas: "", fecha_ultimo_contacto: "",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GestionClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [form, setForm] = useState<CForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [boletas, setBoletas] = useState<Boleta[]>([]);
  const [loadingBoletas, setLoadingBoletas] = useState(false);

  const loadClientes = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      const r = await fetch(`${API}/gestion/clientes?${params}`);
      const d = await r.json() as { success: boolean; clientes?: Cliente[] };
      if (d.success) setClientes(d.clientes ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [q]);

  useEffect(() => { loadClientes(); }, [loadClientes]);

  async function loadBoletas(clienteId: string) {
    setLoadingBoletas(true);
    setBoletas([]);
    try {
      const r = await fetch(`${API}/gestion/clientes/${clienteId}/boletas`);
      const d = await r.json() as { success: boolean; boletas?: Boleta[] };
      if (d.success) setBoletas(d.boletas ?? []);
    } catch { /* silent */ }
    finally { setLoadingBoletas(false); }
  }

  function openAdd() {
    setEditingCliente(null);
    setForm(EMPTY_FORM);
    setBoletas([]);
    setApiError(null);
    setShowModal(true);
  }

  function openEdit(c: Cliente) {
    setEditingCliente(c);
    setForm({
      nombre_comercial: c.nombre_comercial,
      codigo_sn: c.codigo_sn ?? "",
      nit: c.nit ?? "",
      registro_fiscal: c.registro_fiscal ?? "",
      correo: c.correo ?? "",
      telefono: c.telefono ?? "",
      direccion: c.direccion ?? "",
      persona_contacto: c.persona_contacto ?? "",
      cargo_contacto: c.cargo_contacto ?? "",
      facturar_a_nombre_de: c.facturar_a_nombre_de ?? "",
      vendedor_asignado: c.vendedor_asignado ?? "",
      segmento: c.segmento ?? "",
      sitio_web: c.sitio_web ?? "",
      notas_internas: c.notas_internas ?? "",
      fecha_ultimo_contacto: c.fecha_ultimo_contacto ?? "",
    });
    setApiError(null);
    setBoletas([]);
    setShowModal(true);
    loadBoletas(c.id);
  }

  async function save() {
    setSaving(true);
    setApiError(null);
    try {
      const url = editingCliente
        ? `${API}/gestion/clientes/${editingCliente.id}`
        : `${API}/gestion/clientes`;
      const method = editingCliente ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowModal(false);
        await loadClientes();
      } else {
        setApiError(d.error ?? "Error al guardar");
      }
    } catch { setApiError("Error de conexión"); }
    finally { setSaving(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="text-lg font-bold text-white">Organizador de Clientes</h2>
          {!loading && (
            <span className="px-2.5 py-0.5 rounded-full bg-[#7C3AED]/15 border border-[#7C3AED]/25 text-[#A78BFA] text-xs font-semibold tabular-nums">
              {clientes.length} cliente{clientes.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-sm font-semibold hover:bg-[#7C3AED]/25 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo cliente
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
        <input
          className="w-full bg-[#111] border border-[#222] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#7C3AED]/50"
          placeholder="Buscar por nombre, código SAP, NIT, correo..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#555]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : clientes.length === 0 ? (
          <div className="py-12 text-center text-[#555] text-sm">No se encontraron clientes</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E1E1E]">
                  {["#", "Nombre comercial", "Código SAP", "Correo electrónico", "Teléfono", "NIT", "Contacto", "Segmento", "Vendedor", "Última visita", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, idx) => (
                  <tr key={c.id} className="border-b border-[#1A1A1A] hover:bg-white/[0.02] cursor-pointer" onClick={() => openEdit(c)}>
                    <td className="px-4 py-3 text-[#555] text-xs font-mono tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3 font-medium text-white max-w-[180px] truncate">{c.nombre_comercial}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#888]">{c.codigo_sn ?? "—"}</td>
                    <td className="px-4 py-3 text-[#888] text-xs max-w-[160px] truncate">{c.correo ?? "—"}</td>
                    <td className="px-4 py-3 text-[#888] text-xs whitespace-nowrap">{c.telefono ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#888]">{c.nit ?? "—"}</td>
                    <td className="px-4 py-3 text-[#888] text-xs max-w-[120px] truncate">{c.persona_contacto ?? "—"}</td>
                    <td className="px-4 py-3">
                      {c.segmento ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#7C3AED]/10 text-[#A78BFA] border border-[#7C3AED]/20 whitespace-nowrap">
                          {c.segmento}
                        </span>
                      ) : <span className="text-[#555] text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#888] text-xs max-w-[140px] truncate">{c.vendedor_asignado ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-[#888] whitespace-nowrap">{fmtDate(c.ultima_visita)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => openEdit(c)} className="text-[#555] hover:text-white p-1 rounded">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E] shrink-0">
              <h3 className="font-bold text-white">{editingCliente ? "Editar cliente" : "Nuevo cliente"}</h3>
              <button onClick={() => setShowModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {apiError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400 mb-3">{apiError}</div>}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre comercial *" className="col-span-2">
                  <input className={INPUT} value={form.nombre_comercial} onChange={(e) => setForm((f) => ({ ...f, nombre_comercial: e.target.value }))} placeholder="Nombre del cliente" />
                </Field>
                <Field label="Código SAP">
                  <input className={INPUT} value={form.codigo_sn} onChange={(e) => setForm((f) => ({ ...f, codigo_sn: e.target.value }))} placeholder="Ej. C000000011" />
                </Field>
                <Field label="NIT">
                  <input className={INPUT} value={form.nit} onChange={(e) => setForm((f) => ({ ...f, nit: e.target.value }))} placeholder="0000-000000-000-0" />
                </Field>
                <Field label="Registro fiscal">
                  <input className={INPUT} value={form.registro_fiscal} onChange={(e) => setForm((f) => ({ ...f, registro_fiscal: e.target.value }))} />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" className={INPUT} value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@empresa.com" />
                </Field>
                <Field label="Teléfono">
                  <input className={INPUT} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="(503) 0000-0000" />
                </Field>
                <Field label="Dirección" className="col-span-2">
                  <input className={INPUT} value={form.direccion} onChange={(e) => setForm((f) => ({ ...f, direccion: e.target.value }))} />
                </Field>
                <Field label="Persona de contacto">
                  <input className={INPUT} value={form.persona_contacto} onChange={(e) => setForm((f) => ({ ...f, persona_contacto: e.target.value }))} />
                </Field>
                <Field label="Cargo del contacto">
                  <input className={INPUT} value={form.cargo_contacto} onChange={(e) => setForm((f) => ({ ...f, cargo_contacto: e.target.value }))} />
                </Field>
                <Field label="Facturar a nombre de" className="col-span-2">
                  <input className={INPUT} value={form.facturar_a_nombre_de} onChange={(e) => setForm((f) => ({ ...f, facturar_a_nombre_de: e.target.value }))} />
                </Field>
                <Field label="Vendedor asignado" className="col-span-2">
                  <input className={INPUT} value={form.vendedor_asignado} onChange={(e) => setForm((f) => ({ ...f, vendedor_asignado: e.target.value }))} placeholder="Nombre del vendedor" />
                </Field>
                <Field label="Segmento">
                  <select className={INPUT} value={form.segmento} onChange={(e) => setForm((f) => ({ ...f, segmento: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {SEGMENTOS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Último contacto">
                  <input type="date" className={INPUT} value={form.fecha_ultimo_contacto} onChange={(e) => setForm((f) => ({ ...f, fecha_ultimo_contacto: e.target.value }))} />
                </Field>
                <Field label="Sitio web" className="col-span-2">
                  <input className={INPUT} value={form.sitio_web} onChange={(e) => setForm((f) => ({ ...f, sitio_web: e.target.value }))} placeholder="https://..." />
                </Field>
                <Field label="Notas internas" className="col-span-2">
                  <textarea
                    className={INPUT + " resize-none h-20"}
                    value={form.notas_internas}
                    onChange={(e) => setForm((f) => ({ ...f, notas_internas: e.target.value }))}
                    placeholder="Notas adicionales..."
                  />
                </Field>
              </div>

              {/* Historial de boletas (edit only) */}
              {editingCliente && (
                <div className="mt-4 pt-4 border-t border-[#1E1E1E]">
                  <h4 className="text-xs font-bold text-[#555] uppercase tracking-wider mb-2">Historial de boletas recientes</h4>
                  {loadingBoletas ? (
                    <div className="flex items-center gap-2 text-xs text-[#555]"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
                  ) : boletas.length === 0 ? (
                    <p className="text-xs text-[#555]">Sin boletas registradas</p>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {boletas.map((b) => (
                        <div key={b.id} className="flex items-center gap-3 px-3 py-2 bg-[#1A1A1A] rounded-lg">
                          <span className="text-xs font-mono text-[#7C3AED]">#{b.numero_reporte}</span>
                          <span className="text-xs text-[#888]">{fmtDate(b.created_at)}</span>
                          <span className="text-xs text-[#888] truncate flex-1">{b.tecnico_nombre ?? "—"}</span>
                          <span className="text-xs text-[#666]">{b.estado_servicio ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E] shrink-0">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !form.nombre_comercial.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editingCliente ? "Guardar cambios" : "Crear cliente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#7C3AED]/50";
