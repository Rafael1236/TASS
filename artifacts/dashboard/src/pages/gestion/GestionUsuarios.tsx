import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, X, Check, Loader2, Key, Trash2, Shield, Eye, EyeOff, AlertCircle } from "lucide-react";

const API = `${window.location.origin}/api`;

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  gerente_operaciones: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  gerente_comercial: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  supervisor: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  tecnico: "bg-[#2A2A2A] text-[#888] border-[#333]",
  subcontratista: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  gerente_operaciones: "Gte. Operaciones",
  gerente_comercial: "Gte. Comercial",
  supervisor: "Supervisor",
  tecnico: "Técnico",
};

const ALL_ROLES = ["admin", "gerente_operaciones", "gerente_comercial", "supervisor", "tecnico"];
const SPECIAL_USERS = ["mario.chicas", "maribel.santos"];

interface Usuario {
  id: string; nombre: string; usuario: string; correo: string | null;
  rol: string; departamento: string | null; activo: boolean;
  created_at: string; ultimo_acceso?: string | null;
}

interface UForm {
  nombre: string; usuario: string; correo: string;
  rol: string; departamento: string; password: string; activo: boolean;
}

const EMPTY_FORM: UForm = {
  nombre: "", usuario: "", correo: "", rol: "tecnico", departamento: "", password: "TAS2026!", activo: true,
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<UForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [showPass, setShowPass] = useState(false);
  // Password change modal
  const [pwdModal, setPwdModal] = useState<{ id: string; nombre: string } | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  // Delete confirmation
  const [deleteModal, setDeleteModal] = useState<{ id: string; nombre: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Inline role editing
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const roleDropRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/gestion/usuarios`);
      const d = await r.json() as { success: boolean; usuarios?: Usuario[] };
      if (d.success) setUsuarios(d.usuarios ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (roleDropRef.current && !roleDropRef.current.contains(e.target as Node)) {
        setEditingRoleId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function toggleActivo(u: Usuario) {
    try {
      await fetch(`${API}/gestion/usuarios/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !u.activo }),
      });
      setUsuarios((prev) => prev.map((x) => x.id === u.id ? { ...x, activo: !u.activo } : x));
    } catch { /* silent */ }
  }

  async function changeRol(id: string, rol: string) {
    setEditingRoleId(null);
    try {
      await fetch(`${API}/gestion/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rol }),
      });
      setUsuarios((prev) => prev.map((x) => x.id === id ? { ...x, rol } : x));
    } catch { /* silent */ }
  }

  async function savePwd() {
    if (!pwdModal || !newPwd.trim()) return;
    setSavingPwd(true);
    try {
      await fetch(`${API}/gestion/usuarios/${pwdModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPwd }),
      });
      setPwdModal(null);
      setNewPwd("");
    } catch { /* silent */ }
    finally { setSavingPwd(false); }
  }

  async function deleteUser() {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await fetch(`${API}/gestion/usuarios/${deleteModal.id}`, { method: "DELETE" });
      setUsuarios((prev) => prev.filter((x) => x.id !== deleteModal.id));
      setDeleteModal(null);
    } catch { /* silent */ }
    finally { setDeleting(false); }
  }

  async function createUser() {
    setSaving(true);
    setApiError(null);
    try {
      const r = await fetch(`${API}/gestion/usuarios`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json() as { success: boolean; error?: string };
      if (d.success) {
        setShowModal(false);
        await load();
      } else {
        setApiError(d.error ?? "Error al crear");
      }
    } catch { setApiError("Error de conexión"); }
    finally { setSaving(false); }
  }

  const sortedUsers = [...usuarios].sort((a, b) => {
    const roleOrder = ["admin", "gerente_operaciones", "gerente_comercial", "supervisor", "tecnico"];
    return (roleOrder.indexOf(a.rol) - roleOrder.indexOf(b.rol)) || a.nombre.localeCompare(b.nombre);
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[#7C3AED]" />
          <h2 className="text-lg font-bold text-white">Usuarios y Roles</h2>
          <span className="text-xs text-[#555]">({usuarios.length})</span>
        </div>
        <button
          onClick={() => { setForm(EMPTY_FORM); setApiError(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#7C3AED]/15 border border-[#7C3AED]/30 text-[#A78BFA] text-sm font-semibold hover:bg-[#7C3AED]/25 transition-colors"
        >
          <Plus className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      {/* Special users notice */}
      <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-300">
          <strong>mario.chicas</strong> y <strong>maribel.santos</strong> tienen rol <em>Gerente de Operaciones</em> — acceso a Módulos 1 y 2 de Gestión.
        </p>
      </div>

      {/* Table */}
      <div className="bg-[#111] border border-[#222] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-[#555]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E1E1E]">
                  {["Nombre", "Usuario", "Correo", "Rol", "Departamento", "Último acceso", "Estado", "Acciones"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] font-semibold text-[#555] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((u) => {
                  const isSpecial = SPECIAL_USERS.includes(u.usuario);
                  return (
                    <tr key={u.id} className={`border-b border-[#1A1A1A] hover:bg-white/[0.02] ${isSpecial ? "bg-blue-500/[0.03]" : ""}`}>
                      <td className="px-4 py-3 font-medium text-white">
                        {u.nombre}
                        {isSpecial && <span className="ml-2 text-[9px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">Módulos 1 y 2</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#888]">{u.usuario}</td>
                      <td className="px-4 py-3 text-xs text-[#888]">{u.correo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div
                          className="relative inline-block"
                          ref={editingRoleId === u.id ? roleDropRef : undefined}
                        >
                          <button
                            onClick={() => setEditingRoleId(editingRoleId === u.id ? null : u.id)}
                            className={`text-xs px-2 py-0.5 rounded-full border font-medium cursor-pointer hover:opacity-80 transition-opacity ${ROLE_STYLES[u.rol] ?? ROLE_STYLES.tecnico}`}
                          >
                            {ROLE_LABELS[u.rol] ?? u.rol}
                          </button>
                          {editingRoleId === u.id && (
                            <div className="absolute left-0 top-7 z-50 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl shadow-2xl overflow-hidden min-w-[160px]">
                              {ALL_ROLES.map((r) => (
                                <button
                                  key={r}
                                  onClick={() => changeRol(u.id, r)}
                                  className={`w-full text-left px-3 py-2 text-xs hover:bg-white/5 flex items-center gap-2 ${u.rol === r ? "text-white" : "text-[#888]"}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${u.rol === r ? "bg-[#7C3AED]" : "bg-transparent"}`} />
                                  {ROLE_LABELS[r] ?? r}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#888]">{u.departamento ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-[#888]">{fmtDate(u.ultimo_acceso)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleActivo(u)}
                          className={`relative w-9 h-5 rounded-full transition-colors ${u.activo ? "bg-[#7C3AED]" : "bg-[#333]"}`}
                        >
                          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${u.activo ? "translate-x-4" : "translate-x-0.5"}`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setPwdModal({ id: u.id, nombre: u.nombre }); setNewPwd(""); }}
                            className="text-[#555] hover:text-amber-400 p-1 rounded transition-colors"
                            title="Cambiar contraseña"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteModal({ id: u.id, nombre: u.nombre })}
                            className="text-[#555] hover:text-red-400 p-1 rounded transition-colors"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New user modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white">Nuevo usuario</h3>
              <button onClick={() => setShowModal(false)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4 flex flex-col gap-3">
              {apiError && <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">{apiError}</div>}
              <Field label="Nombre completo *">
                <input className={INPUT} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Usuario *">
                  <input className={INPUT} value={form.usuario} onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))} placeholder="nombre.apellido" />
                </Field>
                <Field label="Contraseña *">
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      className={INPUT + " pr-8"}
                      value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    />
                    <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555]">
                      {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </Field>
              </div>
              <Field label="Correo electrónico">
                <input type="email" className={INPUT} value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Rol">
                  <select className={INPUT} value={form.rol} onChange={(e) => setForm((f) => ({ ...f, rol: e.target.value }))}>
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                  </select>
                </Field>
                <Field label="Departamento">
                  <input className={INPUT} value={form.departamento} onChange={(e) => setForm((f) => ({ ...f, departamento: e.target.value }))} />
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
                onClick={createUser}
                disabled={saving || !form.nombre.trim() || !form.usuario.trim()}
                className="px-4 py-2 rounded-lg bg-[#7C3AED] text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Crear usuario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password change modal */}
      {pwdModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E1E1E]">
              <h3 className="font-bold text-white">Cambiar contraseña</h3>
              <button onClick={() => setPwdModal(null)} className="text-[#555] hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-[#888] mb-3">Usuario: <span className="text-white">{pwdModal.nombre}</span></p>
              <Field label="Nueva contraseña">
                <div className="relative">
                  <input
                    type={showNewPwd ? "text" : "password"}
                    className={INPUT + " pr-8"}
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    placeholder="Nueva contraseña"
                  />
                  <button type="button" onClick={() => setShowNewPwd((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555]">
                    {showNewPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setPwdModal(null)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={savePwd}
                disabled={savingPwd || !newPwd.trim()}
                className="px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {savingPwd ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Cambiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-[#111] border border-[#2A2A2A] rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Eliminar usuario</h3>
                  <p className="text-xs text-[#666]">Esta acción no se puede deshacer</p>
                </div>
              </div>
              <p className="text-sm text-[#888]">
                ¿Eliminar a <span className="text-white font-medium">{deleteModal.nombre}</span> permanentemente?
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-[#1E1E1E]">
              <button onClick={() => setDeleteModal(null)} className="px-4 py-2 rounded-lg border border-[#333] text-xs text-[#777] hover:text-white">Cancelar</button>
              <button
                onClick={deleteUser}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Eliminar
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
