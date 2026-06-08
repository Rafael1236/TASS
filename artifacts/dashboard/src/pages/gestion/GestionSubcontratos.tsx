import { useState, useEffect, useCallback } from "react";
import {
  Building2, Plus, Pencil, Check, X,
  Users, Phone, Mail, User, Save, Loader2, UserPlus, KeyRound,
  Eye, EyeOff, Info, LogIn,
} from "lucide-react";

const API = `${window.location.origin}/api`;

interface Alertas { critico: number; proximo: number; total: number; }
interface Empresa {
  id: string; nombre: string; contacto: string | null;
  telefono: string | null; correo: string | null; direccion: string | null;
  activo: boolean; lider_empresa: string | null; lider_usuario_id: string | null;
  alertas: Alertas;
}
interface Tecnico {
  id: string; nombre: string; activo: boolean;
  dui: string | null; telefono: string | null;
  fecha_ingreso: string | null; tiene_isss: boolean | null;
  fecha_vencimiento_examenes: string | null; empresa_id: string | null;
}
interface TecForm {
  nombre: string; apellido: string; activo: boolean;
  dui: string | null; telefono: string | null;
  fecha_nacimiento: string | null;
  tiene_isss: boolean | null; fecha_vencimiento_examenes: string | null;
}
interface UsuarioSub {
  id: string; nombre: string; usuario: string;
  correo: string | null; empresa_id: string; activo: boolean;
  ultimo_acceso: string | null;
}

const EMPTY_TECNICO: TecForm = {
  nombre: "", apellido: "", activo: true, dui: "", telefono: "",
  fecha_nacimiento: "", tiene_isss: false, fecha_vencimiento_examenes: "",
};

const EMPTY_EMPRESA = { nombre: "", lider_empresa: "", telefono: "", correo: "", direccion: "" };
const EMPTY_USUARIO = { nombre: "", usuario: "", correo: "", password: "TAS2026!" };

function examenStatus(fecha: string | null): "ok" | "proximo" | "critico" | "sin_fecha" {
  if (!fecha) return "sin_fecha";
  const venc = new Date(fecha);
  const hoy = new Date();
  const dias = Math.ceil((venc.getTime() - hoy.getTime()) / 86400000);
  if (dias <= 30) return "critico";
  if (dias <= 60) return "proximo";
  return "ok";
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GestionSubcontratos() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [tecLoading, setTecLoading] = useState(false);

  // Edit empresa
  const [editingEmpresa, setEditingEmpresa] = useState(false);
  const [empresaForm, setEmpresaForm] = useState<Partial<Empresa>>({});
  const [savingEmpresa, setSavingEmpresa] = useState(false);

  // New empresa modal
  const [showNewEmpresaModal, setShowNewEmpresaModal] = useState(false);
  const [newEmpresaForm, setNewEmpresaForm] = useState(EMPTY_EMPRESA);
  const [savingNewEmpresa, setSavingNewEmpresa] = useState(false);
  const [newEmpresaErr, setNewEmpresaErr] = useState<string | null>(null);

  // Tecnico modal
  const [showTecModal, setShowTecModal] = useState(false);
  const [editingTec, setEditingTec] = useState<Tecnico | null>(null);
  const [tecForm, setTecForm] = useState<TecForm>(EMPTY_TECNICO);
  const [savingTec, setSavingTec] = useState(false);

  // New usuario modal
  const [showNewUsuarioModal, setShowNewUsuarioModal] = useState(false);
  const [newUsuarioForm, setNewUsuarioForm] = useState(EMPTY_USUARIO);
  const [savingNewUsuario, setSavingNewUsuario] = useState(false);
  const [newUsuarioErr, setNewUsuarioErr] = useState<string | null>(null);

  // Edit usuario modal
  const [showEditUsuarioModal, setShowEditUsuarioModal] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioSub | null>(null);
  const [editUsuarioForm, setEditUsuarioForm] = useState({ nombre: "", usuario: "", correo: "", activo: true });
  const [savingEditUsuario, setSavingEditUsuario] = useState(false);
  const [editUsuarioErr, setEditUsuarioErr] = useState<string | null>(null);

  // Change password modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UsuarioSub | null>(null);
  const [pwForm, setPwForm] = useState({ nueva: "", confirmar: "" });
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const selectedEmpresa = empresas.find((e) => e.id === selectedId) ?? null;

  const loadEmpresas = useCallback(async () => {
    try {
      const r = await fetch(`${API}/gestion/subcontratos/empresas`);
      const d = await r.json() as { success: boolean; empresas?: Empresa[] };
      if (d.success) {
        setEmpresas(d.empresas ?? []);
        if (!selectedId && (d.empresas ?? []).length > 0) {
          setSelectedId((d.empresas ?? [])[0]!.id);
        }
      }
    } catch { setError("Error al cargar empresas"); }
    finally { setLoading(false); }
  }, [selectedId]);

  const loadTecnicos = useCallback(async (empresaId: string) => {
    setTecLoading(true);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/tecnicos?empresa_id=${empresaId}`);
      const d = await r.json() as { success: boolean; tecnicos?: Tecnico[] };
      if (d.success) setTecnicos(d.tecnicos ?? []);
    } catch { /* silent */ }
    finally { setTecLoading(false); }
  }, []);

  const loadUsuarios = useCallback(async (empresaId: string) => {
    try {
      const r = await fetch(`${API}/gestion/subcontratos/usuarios?empresa_id=${empresaId}`);
      const d = await r.json() as { success: boolean; usuarios?: UsuarioSub[] };
      if (d.success) setUsuarios(d.usuarios ?? []);
    } catch { /* silent */ }
  }, []);

  function openEditUsuario(u: UsuarioSub) {
    setEditingUsuario(u);
    setEditUsuarioForm({ nombre: u.nombre, usuario: u.usuario, correo: u.correo ?? "", activo: u.activo });
    setEditUsuarioErr(null);
    setShowEditUsuarioModal(true);
  }

  async function saveEditUsuario() {
    if (!editingUsuario) return;
    setSavingEditUsuario(true); setEditUsuarioErr(null);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/usuarios/${editingUsuario.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editUsuarioForm),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowEditUsuarioModal(false);
        if (selectedId) await loadUsuarios(selectedId);
      } else {
        setEditUsuarioErr(d.error ?? "Error al guardar");
      }
    } catch { setEditUsuarioErr("Error de conexión"); }
    finally { setSavingEditUsuario(false); }
  }

  function openPasswordModal(u: UsuarioSub) {
    setPasswordTarget(u);
    setPwForm({ nueva: "", confirmar: "" });
    setPwErr(null);
    setShowPw(false); setShowConfirmPw(false);
    setShowPasswordModal(true);
  }

  async function savePassword() {
    if (!passwordTarget) return;
    if (!pwForm.nueva.trim()) { setPwErr("Ingresa una contraseña"); return; }
    if (pwForm.nueva !== pwForm.confirmar) { setPwErr("Las contraseñas no coinciden"); return; }
    setSavingPw(true); setPwErr(null);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/usuarios/${passwordTarget.id}/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwForm.nueva }),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowPasswordModal(false);
      } else {
        setPwErr(d.error ?? "Error al cambiar contraseña");
      }
    } catch { setPwErr("Error de conexión"); }
    finally { setSavingPw(false); }
  }

  async function toggleUsuarioActivo(u: UsuarioSub) {
    try {
      await fetch(`${API}/gestion/subcontratos/usuarios/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !u.activo }),
      });
      if (selectedId) await loadUsuarios(selectedId);
    } catch { /* silent */ }
  }

  useEffect(() => { loadEmpresas(); }, [loadEmpresas]);

  useEffect(() => {
    if (selectedId) {
      loadTecnicos(selectedId);
      loadUsuarios(selectedId);
    } else {
      setTecnicos([]);
      setUsuarios([]);
    }
  }, [selectedId, loadTecnicos, loadUsuarios]);

  function startEditEmpresa() {
    if (!selectedEmpresa) return;
    setEmpresaForm({
      nombre: selectedEmpresa.nombre,
      contacto: selectedEmpresa.contacto ?? "",
      lider_empresa: selectedEmpresa.lider_empresa ?? "",
      lider_usuario_id: selectedEmpresa.lider_usuario_id ?? "",
      telefono: selectedEmpresa.telefono ?? "",
      correo: selectedEmpresa.correo ?? "",
      direccion: selectedEmpresa.direccion ?? "",
    });
    setEditingEmpresa(true);
  }

  async function saveEmpresa() {
    if (!selectedId) return;
    setSavingEmpresa(true);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/empresas/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(empresaForm),
      });
      const d = await r.json() as { success: boolean };
      if (d.success) { setEditingEmpresa(false); await loadEmpresas(); }
    } catch { /* silent */ }
    finally { setSavingEmpresa(false); }
  }

  async function saveNewEmpresa() {
    if (!newEmpresaForm.nombre.trim()) return;
    setSavingNewEmpresa(true); setNewEmpresaErr(null);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/empresas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEmpresaForm),
      });
      const d = await r.json() as { success: boolean; error?: string; empresa?: Empresa };
      if (d.success) {
        setShowNewEmpresaModal(false);
        setNewEmpresaForm(EMPTY_EMPRESA);
        // Select the new company after reload
        const newId = d.empresa?.id ?? null;
        await loadEmpresas();
        if (newId) setSelectedId(newId);
      } else {
        setNewEmpresaErr(d.error ?? "Error al crear empresa");
      }
    } catch { setNewEmpresaErr("Error de conexión"); }
    finally { setSavingNewEmpresa(false); }
  }

  function openAddTec() {
    setEditingTec(null);
    setTecForm(EMPTY_TECNICO);
    setShowTecModal(true);
  }

  function openEditTec(tec: Tecnico) {
    setEditingTec(tec);
    const parts = tec.nombre.trim().split(/\s+/);
    const primerNombre = parts[0] ?? "";
    const apellido = parts.slice(1).join(" ");
    setTecForm({
      nombre: primerNombre,
      apellido,
      activo: tec.activo,
      dui: tec.dui ?? "",
      telefono: tec.telefono ?? "",
      fecha_nacimiento: tec.fecha_ingreso ?? "",
      tiene_isss: tec.tiene_isss ?? false,
      fecha_vencimiento_examenes: tec.fecha_vencimiento_examenes ?? "",
    });
    setShowTecModal(true);
  }

  async function saveTec() {
    if (!selectedId) return;
    setSavingTec(true);
    try {
      const nombreCompleto = [tecForm.nombre.trim(), tecForm.apellido.trim()].filter(Boolean).join(" ");
      const body = {
        nombre: nombreCompleto,
        activo: tecForm.activo,
        dui: tecForm.dui,
        telefono: tecForm.telefono,
        fecha_ingreso: tecForm.fecha_nacimiento || null,
        tiene_isss: tecForm.tiene_isss,
        fecha_vencimiento_examenes: tecForm.fecha_vencimiento_examenes,
        empresa_id: selectedId,
      };
      const url = editingTec
        ? `${API}/gestion/subcontratos/tecnicos/${editingTec.id}`
        : `${API}/gestion/subcontratos/tecnicos`;
      const method = editingTec ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json() as { success: boolean };
      if (d.success) { setShowTecModal(false); await loadTecnicos(selectedId); }
    } catch { /* silent */ }
    finally { setSavingTec(false); }
  }

  async function saveNewUsuario() {
    if (!newUsuarioForm.nombre.trim() || !newUsuarioForm.usuario.trim() || !selectedId) return;
    setSavingNewUsuario(true); setNewUsuarioErr(null);
    try {
      const r = await fetch(`${API}/gestion/subcontratos/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newUsuarioForm, empresa_id: selectedId }),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowNewUsuarioModal(false);
        setNewUsuarioForm(EMPTY_USUARIO);
        await loadUsuarios(selectedId);
      } else {
        setNewUsuarioErr(d.error ?? "Error al crear usuario");
      }
    } catch { setNewUsuarioErr("Error de conexión"); }
    finally { setSavingNewUsuario(false); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-[#555]">
      <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando empresas...
    </div>
  );

  return (
    <div className="flex gap-4 h-full">
      {/* Left: company list */}
      <aside className="w-64 shrink-0 flex flex-col gap-2">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="w-4 h-4 text-[#7C3AED]" />
          <h3 className="text-sm font-bold text-white">Empresas</h3>
          <span className="ml-auto text-xs text-[#555]">{empresas.length}</span>
        </div>

        <button
          onClick={() => { setShowNewEmpresaModal(true); setNewEmpresaErr(null); setNewEmpresaForm(EMPTY_EMPRESA); }}
          className="flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-xs font-semibold hover:bg-[#7C3AED]/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Nueva empresa
        </button>

        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-230px)]">
          {empresas.map((emp) => {
            const isSelected = emp.id === selectedId;
            const hasCritico = emp.alertas.critico > 0;
            const hasProximo = emp.alertas.proximo > 0;
            return (
              <button
                key={emp.id}
                onClick={() => setSelectedId(emp.id)}
                className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? "bg-[#7C3AED]/15 border-[#7C3AED]/30 text-white"
                    : "border-transparent hover:bg-white/5 text-[#888]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate flex-1">{emp.nombre}</span>
                  {hasCritico && (
                    <span className="shrink-0 w-5 h-5 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-bold flex items-center justify-center">
                      {emp.alertas.critico}
                    </span>
                  )}
                  {!hasCritico && hasProximo && (
                    <span className="shrink-0 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[9px] font-bold flex items-center justify-center">
                      {emp.alertas.proximo}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-[#555] mt-0.5">{emp.alertas.total} técnico{emp.alertas.total !== 1 ? "s" : ""}</p>
              </button>
            );
          })}
          {empresas.length === 0 && (
            <p className="text-xs text-[#555] px-3 py-4 text-center">No hay empresas registradas</p>
          )}
        </div>
      </aside>

      {/* Right: detail */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {!selectedEmpresa ? (
          <div className="flex items-center justify-center h-64 text-[#555]">
            <p>Selecciona una empresa o crea una nueva</p>
          </div>
        ) : (
          <>
            {/* Company info card */}
            <div className="bg-[#111] border border-[#222] rounded-xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  {editingEmpresa ? (
                    <input
                      className="bg-[#1A1A1A] border border-[#333] rounded-lg px-3 py-1.5 text-white text-lg font-bold w-full mb-1"
                      value={empresaForm.nombre ?? ""}
                      onChange={(e) => setEmpresaForm((f) => ({ ...f, nombre: e.target.value }))}
                    />
                  ) : (
                    <h2 className="text-lg font-bold text-white">{selectedEmpresa.nombre}</h2>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${selectedEmpresa.activo ? "bg-emerald-500/15 text-emerald-400" : "bg-[#333] text-[#666]"}`}>
                    {selectedEmpresa.activo ? "Activa" : "Inactiva"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {editingEmpresa ? (
                    <>
                      <button onClick={() => setEditingEmpresa(false)} className="px-3 py-1.5 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">
                        Cancelar
                      </button>
                      <button onClick={saveEmpresa} disabled={savingEmpresa} className="px-3 py-1.5 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
                        {savingEmpresa ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Guardar
                      </button>
                    </>
                  ) : (
                    <button onClick={startEditEmpresa} className="px-3 py-1.5 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white flex items-center gap-1">
                      <Pencil className="w-3 h-3" /> Editar
                    </button>
                  )}
                </div>
              </div>

              {/* Líder destacado en header cuando no editando */}
              {!editingEmpresa && selectedEmpresa.lider_empresa && (
                <p className="text-sm text-[#A78BFA] flex items-center gap-1.5 mb-3 -mt-2">
                  <span>👤</span>
                  <span className="font-medium">Líder: {selectedEmpresa.lider_empresa}</span>
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: User, label: "Contacto", key: "contacto" as const },
                  { icon: Phone, label: "Teléfono", key: "telefono" as const },
                  { icon: Mail, label: "Correo", key: "correo" as const },
                ].map(({ icon: Icon, label, key }) => (
                  <div key={key} className="flex items-start gap-2">
                    <Icon className="w-3.5 h-3.5 text-[#555] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-[#555] uppercase tracking-wider">{label}</p>
                      {editingEmpresa ? (
                        <input
                          className="bg-[#1A1A1A] border border-[#333] rounded px-2 py-1 text-xs text-white w-full mt-0.5"
                          value={(empresaForm[key] as string) ?? ""}
                          onChange={(e) => setEmpresaForm((f) => ({ ...f, [key]: e.target.value }))}
                        />
                      ) : (
                        <p className="text-sm text-[#CCC] truncate">{(selectedEmpresa[key] as string | null) ?? "—"}</p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Líder — dropdown de usuarios en edición, texto en vista */}
                <div className="flex items-start gap-2">
                  <User className="w-3.5 h-3.5 text-[#555] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">Líder de empresa</p>
                    {editingEmpresa ? (
                      <select
                        className="bg-[#1A1A1A] border border-[#333] rounded px-2 py-1 text-xs text-white w-full mt-0.5 focus:outline-none focus:border-[#7C3AED]/50"
                        value={(empresaForm.lider_usuario_id as string) ?? ""}
                        onChange={(e) => {
                          const uid = e.target.value;
                          const u = usuarios.find((u) => u.id === uid);
                          setEmpresaForm((f) => ({
                            ...f,
                            lider_usuario_id: uid,
                            lider_empresa: u ? u.nombre : f.lider_empresa,
                          }));
                        }}
                      >
                        <option value="">— Sin asignar —</option>
                        {usuarios.map((u) => (
                          <option key={u.id} value={u.id}>{u.nombre}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-[#CCC] truncate">{selectedEmpresa.lider_empresa ?? "—"}</p>
                    )}
                  </div>
                </div>
                {/* Dirección — full width */}
                <div className="col-span-2 flex items-start gap-2">
                  <Building2 className="w-3.5 h-3.5 text-[#555] mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-[#555] uppercase tracking-wider">Dirección</p>
                    {editingEmpresa ? (
                      <input
                        className="bg-[#1A1A1A] border border-[#333] rounded px-2 py-1 text-xs text-white w-full mt-0.5"
                        value={(empresaForm.direccion as string) ?? ""}
                        onChange={(e) => setEmpresaForm((f) => ({ ...f, direccion: e.target.value }))}
                      />
                    ) : (
                      <p className="text-sm text-[#CCC]">{selectedEmpresa.direccion ?? "—"}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Users section */}
            <div className="flex flex-col gap-2">
              {/* Info box */}
              <div className="flex items-start gap-2.5 rounded-lg border border-[#7C3AED]/20 bg-[#7C3AED]/5 px-4 py-3">
                <Info className="w-3.5 h-3.5 text-[#7C3AED] shrink-0 mt-0.5" />
                <p className="text-xs text-[#9A9A9A] leading-relaxed">
                  Los usuarios subcontratistas acceden al sistema desde la app móvil con su usuario y contraseña.{" "}
                  <span className="text-[#A78BFA]">La contraseña por defecto es <span className="font-mono font-semibold">TAS2026!</span></span>
                </p>
              </div>

              <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E1E1E]">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-[#7C3AED]" />
                    <h3 className="text-sm font-bold text-white">Usuarios de acceso</h3>
                    <span className="text-xs text-[#555]">({usuarios.length})</span>
                  </div>
                  <button
                    onClick={() => { setShowNewUsuarioModal(true); setNewUsuarioErr(null); setNewUsuarioForm(EMPTY_USUARIO); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-xs font-semibold hover:bg-[#7C3AED]/25 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Nuevo usuario
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1E1E1E]">
                        {["Nombre", "Usuario", "Correo", "Último acceso", "Estado", "Activo", ""].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map((u) => (
                        <tr key={u.id} className="border-b border-[#1A1A1A] hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-white whitespace-nowrap">{u.nombre}</td>
                          <td className="px-4 py-3 text-[#888] font-mono text-xs whitespace-nowrap">@{u.usuario}</td>
                          <td className="px-4 py-3 text-xs text-[#555]">{u.correo ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-[#555] whitespace-nowrap">
                            {u.ultimo_acceso ? (
                              <span className="flex items-center gap-1 text-[#666]">
                                <LogIn className="w-3 h-3" />
                                {new Date(u.ultimo_acceso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${u.activo ? "bg-emerald-500/15 text-emerald-400" : "bg-[#333] text-[#666]"}`}>
                              {u.activo ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => toggleUsuarioActivo(u)}
                              title={u.activo ? "Desactivar" : "Activar"}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${u.activo ? "bg-emerald-600" : "bg-[#333]"}`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${u.activo ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => openEditUsuario(u)}
                                title="Editar usuario"
                                className="p-1.5 rounded text-[#555] hover:text-white hover:bg-white/5 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => openPasswordModal(u)}
                                title="Cambiar contraseña"
                                className="p-1.5 rounded text-[#555] hover:text-[#A78BFA] hover:bg-[#7C3AED]/10 transition-colors"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {usuarios.length === 0 && (
                        <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-[#555]">Sin usuarios registrados</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Technicians section */}
            <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1E1E1E]">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#7C3AED]" />
                  <h3 className="text-sm font-bold text-white">Técnicos subcontratistas</h3>
                  <span className="text-xs text-[#555]">({tecnicos.length})</span>
                </div>
                <button
                  onClick={openAddTec}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-xs font-semibold hover:bg-[#7C3AED]/25 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Agregar técnico
                </button>
              </div>

              {tecLoading ? (
                <div className="flex items-center justify-center py-8 text-[#555]">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Cargando...
                </div>
              ) : tecnicos.length === 0 ? (
                <div className="py-8 text-center text-[#555] text-sm">
                  No hay técnicos registrados para esta empresa
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1E1E1E]">
                        {["Nombre", "DUI", "ISSS", "Teléfono", "Estado", ""].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tecnicos.map((tec) => {
                        return (
                          <tr key={tec.id} className="border-b border-[#1A1A1A] hover:bg-white/[0.02]">
                            <td className="px-4 py-3 font-medium text-white">{tec.nombre}</td>
                            <td className="px-4 py-3 text-[#888] font-mono text-xs">{tec.dui ?? "—"}</td>
                            <td className="px-4 py-3">
                              {tec.tiene_isss
                                ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><Check className="w-3 h-3" /> Sí</span>
                                : <span className="flex items-center gap-1 text-[#555] text-xs"><X className="w-3 h-3" /> No</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-[#888]">{tec.telefono ?? "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                tec.activo ? "bg-emerald-500/15 text-emerald-400" : "bg-[#333] text-[#666]"
                              }`}>
                                {tec.activo ? "Activo" : "Inactivo"}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <button onClick={() => openEditTec(tec)} className="text-[#555] hover:text-white p-1 rounded">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── New Empresa Modal ───────────────────────────────────────────────────── */}
      {showNewEmpresaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-[#7C3AED]" /> Nueva empresa subcontratista</h3>
              <button onClick={() => setShowNewEmpresaModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <Field label="Nombre de la empresa *">
                <input className={INPUT} value={newEmpresaForm.nombre} onChange={(e) => setNewEmpresaForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Instalaciones Técnicas S.A." />
              </Field>
              <Field label="Nombre del líder / responsable *">
                <input className={INPUT} value={newEmpresaForm.lider_empresa} onChange={(e) => setNewEmpresaForm((f) => ({ ...f, lider_empresa: e.target.value }))} placeholder="Carlos Martínez" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono">
                  <input className={INPUT} value={newEmpresaForm.telefono} onChange={(e) => setNewEmpresaForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="7000-0000" />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" className={INPUT} value={newEmpresaForm.correo} onChange={(e) => setNewEmpresaForm((f) => ({ ...f, correo: e.target.value }))} placeholder="empresa@correo.com" />
                </Field>
              </div>
              <Field label="Dirección">
                <input className={INPUT} value={newEmpresaForm.direccion} onChange={(e) => setNewEmpresaForm((f) => ({ ...f, direccion: e.target.value }))} placeholder="Col. Escalón, San Salvador" />
              </Field>
              {newEmpresaErr && <p className="text-xs text-red-400">{newEmpresaErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowNewEmpresaModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={saveNewEmpresa}
                disabled={savingNewEmpresa || !newEmpresaForm.nombre.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingNewEmpresa ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Crear empresa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Usuario Modal ──────────────────────────────────────────────────── */}
      {showNewUsuarioModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white flex items-center gap-2"><UserPlus className="w-4 h-4 text-[#7C3AED]" /> Nuevo usuario — {selectedEmpresa?.nombre}</h3>
              <button onClick={() => setShowNewUsuarioModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <p className="text-xs text-[#555]">Este usuario podrá acceder a la app móvil de subcontratistas.</p>
              <Field label="Nombre completo *">
                <input
                  className={INPUT}
                  value={newUsuarioForm.nombre}
                  onChange={(e) => {
                    const nombre = e.target.value;
                    const auto = nombre.trim().toLowerCase().replace(/\s+/g, ".");
                    setNewUsuarioForm((f) => ({ ...f, nombre, usuario: f.usuario || auto }));
                  }}
                  placeholder="Roberto Flores"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Usuario (login) *">
                  <input className={INPUT} value={newUsuarioForm.usuario} onChange={(e) => setNewUsuarioForm((f) => ({ ...f, usuario: e.target.value.toLowerCase().replace(/\s/g, ".") }))} placeholder="roberto.flores" />
                </Field>
                <Field label="Contraseña *">
                  <input className={INPUT} value={newUsuarioForm.password} onChange={(e) => setNewUsuarioForm((f) => ({ ...f, password: e.target.value }))} placeholder="TAS2026!" />
                </Field>
              </div>
              <Field label="Correo electrónico">
                <input type="email" className={INPUT} value={newUsuarioForm.correo} onChange={(e) => setNewUsuarioForm((f) => ({ ...f, correo: e.target.value }))} placeholder="roberto@empresa.com" />
              </Field>
              {newUsuarioErr && <p className="text-xs text-red-400">{newUsuarioErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowNewUsuarioModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={saveNewUsuario}
                disabled={savingNewUsuario || !newUsuarioForm.nombre.trim() || !newUsuarioForm.usuario.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingNewUsuario ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Crear usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Usuario Modal ─────────────────────────────────────────────────── */}
      {showEditUsuarioModal && editingUsuario && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white flex items-center gap-2">
                <Pencil className="w-4 h-4 text-[#7C3AED]" /> Editar usuario
              </h3>
              <button onClick={() => setShowEditUsuarioModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <Field label="Nombre completo *">
                <input className={INPUT} value={editUsuarioForm.nombre} onChange={(e) => setEditUsuarioForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre completo" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Usuario (login) *">
                  <input className={INPUT} value={editUsuarioForm.usuario} onChange={(e) => setEditUsuarioForm((f) => ({ ...f, usuario: e.target.value.toLowerCase().replace(/\s/g, ".") }))} placeholder="usuario.login" />
                </Field>
                <Field label="Correo electrónico">
                  <input type="email" className={INPUT} value={editUsuarioForm.correo} onChange={(e) => setEditUsuarioForm((f) => ({ ...f, correo: e.target.value }))} placeholder="correo@empresa.com" />
                </Field>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[#2A2A2A] bg-[#1A1A1A] px-4 py-3">
                <div>
                  <p className="text-sm text-white font-medium">Estado</p>
                  <p className="text-xs text-[#555]">{editUsuarioForm.activo ? "El usuario puede iniciar sesión" : "El usuario no puede iniciar sesión"}</p>
                </div>
                <button
                  onClick={() => setEditUsuarioForm((f) => ({ ...f, activo: !f.activo }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editUsuarioForm.activo ? "bg-emerald-600" : "bg-[#444]"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${editUsuarioForm.activo ? "translate-x-[22px]" : "translate-x-[3px]"}`} />
                </button>
              </div>
              {editUsuarioErr && <p className="text-xs text-red-400">{editUsuarioErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowEditUsuarioModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={saveEditUsuario}
                disabled={savingEditUsuario || !editUsuarioForm.nombre.trim() || !editUsuarioForm.usuario.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingEditUsuario ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ───────────────────────────────────────────────── */}
      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#7C3AED]" /> Cambiar contraseña
              </h3>
              <button onClick={() => setShowPasswordModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              <p className="text-xs text-[#666]">
                Usuario: <span className="text-white font-mono font-semibold">@{passwordTarget.usuario}</span>
              </p>
              <Field label="Nueva contraseña">
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    className={`${INPUT} pr-10`}
                    value={pwForm.nueva}
                    onChange={(e) => setPwForm((f) => ({ ...f, nueva: e.target.value }))}
                    placeholder="Nueva contraseña"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              <Field label="Confirmar contraseña">
                <div className="relative">
                  <input
                    type={showConfirmPw ? "text" : "password"}
                    className={`${INPUT} pr-10`}
                    value={pwForm.confirmar}
                    onChange={(e) => setPwForm((f) => ({ ...f, confirmar: e.target.value }))}
                    placeholder="Confirmar contraseña"
                  />
                  <button type="button" onClick={() => setShowConfirmPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-white">
                    {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>
              {pwForm.confirmar && pwForm.nueva !== pwForm.confirmar && (
                <p className="text-xs text-amber-400">Las contraseñas no coinciden</p>
              )}
              {pwErr && <p className="text-xs text-red-400">{pwErr}</p>}
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowPasswordModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={savePassword}
                disabled={savingPw || !pwForm.nueva.trim() || pwForm.nueva !== pwForm.confirmar}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingPw ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Cambiar contraseña
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Technician Modal ───────────────────────────────────────────────────── */}
      {showTecModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white">{editingTec ? "Editar técnico" : "Agregar técnico"}</h3>
              <button onClick={() => setShowTecModal(false)} className="text-[#555] hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nombre *">
                  <input className={INPUT} value={tecForm.nombre} onChange={(e) => setTecForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Carlos" />
                </Field>
                <Field label="Apellido *">
                  <input className={INPUT} value={tecForm.apellido} onChange={(e) => setTecForm((f) => ({ ...f, apellido: e.target.value }))} placeholder="Martínez" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="DUI">
                  <input className={INPUT} value={tecForm.dui ?? ""} onChange={(e) => setTecForm((f) => ({ ...f, dui: e.target.value }))} placeholder="00000000-0" />
                </Field>
                <Field label="Teléfono">
                  <input className={INPUT} value={tecForm.telefono ?? ""} onChange={(e) => setTecForm((f) => ({ ...f, telefono: e.target.value }))} placeholder="7000-0000" />
                </Field>
              </div>
              <Field label="Fecha de nacimiento">
                <input type="date" className={INPUT} value={tecForm.fecha_nacimiento ?? ""} onChange={(e) => setTecForm((f) => ({ ...f, fecha_nacimiento: e.target.value }))} />
              </Field>
              <Field label="Fecha vencimiento exámenes médicos">
                <input type="date" className={INPUT} value={tecForm.fecha_vencimiento_examenes ?? ""} onChange={(e) => setTecForm((f) => ({ ...f, fecha_vencimiento_examenes: e.target.value }))} />
              </Field>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#7C3AED]" checked={!!tecForm.tiene_isss} onChange={(e) => setTecForm((f) => ({ ...f, tiene_isss: e.target.checked }))} />
                  <span className="text-sm text-[#CCC]">Tiene ISSS</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="w-4 h-4 accent-[#7C3AED]" checked={tecForm.activo} onChange={(e) => setTecForm((f) => ({ ...f, activo: e.target.checked }))} />
                  <span className="text-sm text-[#CCC]">Activo</span>
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setShowTecModal(false)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">
                Cancelar
              </button>
              <button onClick={saveTec} disabled={savingTec || !tecForm.nombre.trim() || !tecForm.apellido.trim()} className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50">
                {savingTec ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editingTec ? "Guardar cambios" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-[#555] uppercase tracking-wider mb-1">{label}</label>
      {children}
    </div>
  );
}

const INPUT = "w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white placeholder-[#444] focus:outline-none focus:border-[#7C3AED]/50";
