import { useState, useEffect, useCallback } from "react";
import { Plus, Search, X, Check, Loader2, Pencil, Eye, EyeOff, Users } from "lucide-react";

const API = `${window.location.origin}/api`;

const DEPARTAMENTOS = ["MANTO", "SOPORTE", "PROYECTOS", "PARKING", "SOPORTE EN SITIO", "ADMON. PROYECTOS"];
const ROLES = ["tecnico", "supervisor"];

interface Tecnico {
  id: string; nombre: string; usuario: string;
  correo: string | null; departamento: string | null;
  rol: string; activo: boolean;
  dui?: string | null; telefono?: string | null;
  fecha_ingreso?: string | null; created_at: string;
}

interface TecForm {
  nombre: string; usuario: string; correo: string;
  password: string; departamento: string; rol: string;
  dui: string; telefono: string; fecha_ingreso: string; activo: boolean;
}

const EMPTY_FORM: TecForm = {
  nombre: "", usuario: "", correo: "", password: "TAS2026!",
  departamento: "", rol: "tecnico", dui: "", telefono: "", fecha_ingreso: "", activo: true,
};

function roleBadge(rol: string) {
  const map: Record<string, string> = {
    supervisor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    tecnico: "bg-[#2A2A2A] text-[#888] border-[#333]",
  };
  return map[rol] ?? "bg-[#2A2A2A] text-[#888] border-[#333]";
}

function autoUsuario(nombre: string): string {
  const parts = nombre.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]}.${parts[parts.length - 1]}`;
}

export default function GestionTecnicos() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filterDpto, setFilterDpto] = useState("");
  const [filterRol, setFilterRol] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editingTec, setEditingTec] = useState<Tecnico | null>(null);
  const [form, setForm] = useState<TecForm>(EMPTY_FORM);
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const loadTecnicos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (filterDpto) params.set("departamento", filterDpto);
      if (filterRol) params.set("rol", filterRol);
      const r = await fetch(`${API}/gestion/tecnicos-tas?${params}`);
      const d = await r.json() as { success: boolean; tecnicos?: Tecnico[] };
      if (d.success) setTecnicos(d.tecnicos ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [q, filterDpto, filterRol]);

  useEffect(() => { loadTecnicos(); }, [loadTecnicos]);

  function openAdd() {
    setEditingTec(null);
    setForm(EMPTY_FORM);
    setApiError(null);
    setShowPass(false);
    setShowModal(true);
  }

  function openEdit(tec: Tecnico) {
    setEditingTec(tec);
    setForm({
      nombre: tec.nombre,
      usuario: tec.usuario,
      correo: tec.correo ?? "",
      password: "",
      departamento: tec.departamento ?? "",
      rol: tec.rol,
      dui: tec.dui ?? "",
      telefono: tec.telefono ?? "",
      fecha_ingreso: tec.fecha_ingreso ?? "",
      activo: tec.activo,
    });
    setApiError(null);
    setShowPass(false);
    setShowModal(true);
  }

  function handleNombreChange(nombre: string) {
    setForm((f) => ({
      ...f,
      nombre,
      usuario: editingTec ? f.usuario : autoUsuario(nombre),
    }));
  }

  async function save() {
    setSaving(true);
    setApiError(null);
    try {
      const body = { ...form };
      if (!body.password) delete (body as Partial<TecForm>).password;
      const url = editingTec
        ? `${API}/gestion/tecnicos-tas/${editingTec.id}`
        : `${API}/gestion/tecnicos-tas`;
      const method = editingTec ? "PUT" : "POST";
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowModal(false);
        await loadTecnicos();
        showToast(editingTec ? "✅ Técnico actualizado correctamente" : "✅ Técnico creado correctamente");
      } else {
        setApiError(d.error ?? "Error al guardar");
      }
    } catch { setApiError("Error de conexión — verifica tu red e intenta de nuevo"); }
    finally { setSaving(false); }
  }

  const filtered = tecnicos;

  return (
    <div className="flex flex-col gap-4">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-[#1A1A1A] border border-emerald-500/30 text-emerald-400 text-sm font-medium px-5 py-3 rounded-xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="text-lg font-bold text-white">Técnicos TAS</h2>
          <span className="text-xs text-[#555]">({filtered.length})</span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-sm font-semibold hover:bg-[#7C3AED]/25 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo técnico
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#444]" />
          <input
            className="w-full bg-[#111] border border-[#222] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#7C3AED]/50"
            placeholder="Buscar por nombre..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#888] focus:outline-none focus:border-[#7C3AED]/50"
          value={filterDpto}
          onChange={(e) => setFilterDpto(e.target.value)}
        >
          <option value="">Todos los departamentos</option>
          {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          className="bg-[#111] border border-[#222] rounded-lg px-3 py-2 text-sm text-[#888] focus:outline-none focus:border-[#7C3AED]/50"
          value={filterRol}
          onChange={(e) => setFilterRol(e.target.value)}
        >
          <option value="">Todos los roles</option>
          <option value="tecnico">Técnico</option>
          <option value="supervisor">Supervisor</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#555]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[#555] text-sm">No se encontraron técnicos</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E1E1E]">
                  {["Nombre", "Usuario", "Departamento", "Rol", "Correo", "Estado", ""].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tec) => (
                  <tr key={tec.id} className="border-b border-[#1A1A1A] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">{tec.nombre}</td>
                    <td className="px-4 py-3 font-mono text-xs text-[#888]">{tec.usuario}</td>
                    <td className="px-4 py-3 text-[#888]">{tec.departamento ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${roleBadge(tec.rol)}`}>
                        {tec.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[#888] text-xs">{tec.correo ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tec.activo ? "bg-emerald-500/15 text-emerald-400" : "bg-[#333] text-[#666]"}`}>
                        {tec.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(tec)} className="text-[#555] hover:text-white p-1 rounded">
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
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white">{editingTec ? "Editar técnico" : "Nuevo técnico"}</h3>
              <button onClick={() => setShowModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3 max-h-[65vh] overflow-y-auto">
              {apiError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                  ❌ Error al guardar: {apiError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre completo *" className="col-span-2">
                  <input className={INPUT} value={form.nombre} onChange={(e) => handleNombreChange(e.target.value)} placeholder="Nombre completo" />
                </Field>
                <Field label="Usuario *">
                  <input className={INPUT} value={form.usuario} onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))} placeholder="nombre.apellido" />
                </Field>
                <Field label={editingTec ? "Nueva contraseña (opcional)" : "Contraseña *"}>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      className={INPUT + " pr-8"}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      placeholder={editingTec ? "Nueva contraseña" : "TAS2026!"}
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#999]">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {editingTec && (
                    <p className="text-[10px] text-[#555] mt-1">Dejar vacío para mantener la contraseña actual</p>
                  )}
                </Field>
                <Field label="Correo electrónico" className="col-span-2">
                  <input className={INPUT} type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@tas-seguridad.com" />
                </Field>
                <Field label="Departamento">
                  <select className={INPUT} value={form.departamento} onChange={(e) => setForm((f) => ({ ...f, departamento: e.target.value }))}>
                    <option value="">Seleccionar...</option>
                    {DEPARTAMENTOS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
                <Field label="Rol">
                  <select className={INPUT} value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
                    {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
                  </select>
                </Field>
                <Field label="DUI">
                  <input className={INPUT} value={form.dui} onChange={(e) => setForm((f) => ({ ...f, dui: e.target.value }))} placeholder="00000000-0" />
                </Field>
                <Field label="Teléfono">
                  <input className={INPUT} value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="7000-0000" />
                </Field>
                <Field label="Fecha de ingreso" className="col-span-2">
                  <input type="date" className={INPUT} value={form.fecha_ingreso} onChange={(e) => setForm((f) => ({ ...f, fecha_ingreso: e.target.value }))} />
                </Field>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-[#7C3AED]" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} />
                <span className="text-sm text-[#CCC]">Usuario activo</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={save}
                disabled={saving || !form.nombre.trim() || !form.usuario.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editingTec ? "Guardar cambios" : "Crear técnico"}
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
