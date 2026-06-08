import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, User2, Phone, ClipboardList, Clock, ChevronRight } from "lucide-react";

const API = `${window.location.origin}/api`;
const LS_KEY = "tas_recent_searches";
const MAX_RECENT = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClienteItem { id: string; nombre_comercial: string }

interface LlamadaItem { numero: string; boletas_count: number; clientes: string[] }

export interface BoletaItem {
  id: string;
  numero_reporte: number | null;
  cliente_nombre: string;
  tecnico_nombre: string | null;
  created_at: string;
  estado_revision: string;
  tipo_servicio: string | null;
  trabajo_realizado: string | null;
  numero_llamada: string | null;
  hora_entrada: string | null;
  hora_salida: string | null;
  estado_servicio: string | null;
  observaciones: string | null;
  placa_vehiculo: string | null;
  equipos_instalados: string | null;
}

interface SearchResults {
  tipo_detectado: "numero" | "texto";
  clientes: ClienteItem[];
  llamadas: LlamadaItem[];
  boletas: BoletaItem[];
}

interface ClienteLlamadasState {
  cliente: ClienteItem;
  llamadas: string[];
  loading: boolean;
}

type SearchTipo = "auto" | "cliente" | "llamada" | "boleta";

interface SmartSearchBarProps {
  onSapSelect: (numero: string) => void;
  supervisorId?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" });
}

const ESTADO_MAP: Record<string, { label: string; cls: string }> = {
  revisada: { label: "Revisada", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  pendiente_revision: { label: "Pendiente", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  pendiente_llamada: { label: "Sin llamada", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

function EstadoBadge({ estado }: { estado: string }) {
  const e = ESTADO_MAP[estado] ?? { label: estado, cls: "bg-white/5 text-[#9A9A9A] border-[#2A2A2A]" };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${e.cls}`}>
      {e.label}
    </span>
  );
}

// ── BoletaDetailCard ──────────────────────────────────────────────────────────

function BoletaDetailCard({
  boleta, onClose, onViewSap,
}: { boleta: BoletaItem; onClose: () => void; onViewSap?: () => void }) {
  const rows: Array<{ label: string; value: string | null }> = [
    { label: "Cliente", value: boleta.cliente_nombre || null },
    { label: "Técnico", value: boleta.tecnico_nombre },
    { label: "Tipo servicio", value: boleta.tipo_servicio },
    { label: "Trabajo", value: boleta.trabajo_realizado },
    { label: "Horario", value: boleta.hora_entrada && boleta.hora_salida ? `${boleta.hora_entrada} – ${boleta.hora_salida}` : null },
    { label: "Estado servicio", value: boleta.estado_servicio },
    { label: "Placa vehículo", value: boleta.placa_vehiculo },
    { label: "Equipos inst.", value: boleta.equipos_instalados },
    { label: "Observaciones", value: boleta.observaciones },
    { label: "# Llamada SAP", value: boleta.numero_llamada },
    { label: "Fecha", value: fmtDate(boleta.created_at) },
  ].filter((r) => r.value);

  return (
    <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1C1C1C]">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#CC0000]" />
          <span className="text-sm font-bold text-white font-mono">
            Boleta #{boleta.numero_reporte ?? "—"}
          </span>
          <EstadoBadge estado={boleta.estado_revision} />
        </div>
        <button onClick={onClose} className="text-[#555] hover:text-foreground transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <p className="text-[10px] text-[#555] uppercase tracking-wide font-semibold">{r.label}</p>
            <p className="text-sm text-[#9A9A9A] mt-0.5 leading-snug">{r.value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      {onViewSap && (
        <div className="px-4 pb-4">
          <button
            onClick={onViewSap}
            className="flex items-center gap-1.5 rounded-full border border-[#CC0000]/40 bg-[#CC0000]/10 text-[#CC0000] text-xs font-semibold px-4 py-2 hover:bg-[#CC0000]/20 transition-colors"
          >
            <Phone className="h-3 w-3" />
            Ver reporte de llamada SAP #{boleta.numero_llamada}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function SmartSearchBar({ onSapSelect, supervisorId }: SmartSearchBarProps) {
  const [query, setQuery] = useState("");
  const [tipo, setTipo] = useState<SearchTipo>("auto");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [selectedBoleta, setSelectedBoleta] = useState<BoletaItem | null>(null);
  const [clienteLlamadas, setClienteLlamadas] = useState<ClienteLlamadasState | null>(null);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setRecentSearches(JSON.parse(stored) as string[]);
    } catch { /**/ }
  }, []);

  // Click outside → close dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Search debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 1 || (q.length < 2 && !/^\d+$/.test(q))) { setResults(null); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ q, tipo });
        if (supervisorId) qs.set("supervisor_id", supervisorId);
        const res = await fetch(`${API}/search?${qs}`, { cache: "no-store" });
        const data = await res.json() as SearchResults;
        setResults(data);
      } catch { setResults(null); }
      setLoading(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, tipo, supervisorId]);

  function saveRecent(label: string) {
    const updated = [label, ...recentSearches.filter((r) => r !== label)].slice(0, MAX_RECENT);
    setRecentSearches(updated);
    try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch { /**/ }
  }

  function handleClear() {
    setQuery("");
    setResults(null);
    setSelectedBoleta(null);
    setClienteLlamadas(null);
    setLoading(false);
    inputRef.current?.focus();
  }

  function handleQueryChange(val: string) {
    setQuery(val);
    setSelectedBoleta(null);
    setClienteLlamadas(null);
    if (!focused) setFocused(true);
  }

  function handleSelectLlamada(numero: string) {
    saveRecent(`#${numero}`);
    setQuery(numero);
    setFocused(false);
    setResults(null);
    setSelectedBoleta(null);
    setClienteLlamadas(null);
    onSapSelect(numero);
  }

  function handleSelectBoleta(b: BoletaItem) {
    saveRecent(`Boleta #${b.numero_reporte ?? ""}`);
    setSelectedBoleta(b);
    setFocused(false);
    setResults(null);
  }

  const handleSelectCliente = useCallback(async (c: ClienteItem) => {
    saveRecent(c.nombre_comercial);
    setQuery(c.nombre_comercial);
    setFocused(false);
    setResults(null);
    setClienteLlamadas({ cliente: c, llamadas: [], loading: true });
    try {
      const res = await fetch(`${API}/clientes/llamadas?cliente_id=${encodeURIComponent(c.id)}`);
      const j = await res.json() as { llamadas?: string[] };
      setClienteLlamadas({ cliente: c, llamadas: j.llamadas ?? [], loading: false });
    } catch {
      setClienteLlamadas({ cliente: c, llamadas: [], loading: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentSearches]);

  function handleTogglePill(t: SearchTipo) {
    setTipo((prev) => prev === t ? "auto" : t);
    setResults(null);
    inputRef.current?.focus();
  }

  const showDropdown = focused && !selectedBoleta && !clienteLlamadas;
  const hasResults = results && (results.clientes.length > 0 || results.llamadas.length > 0 || results.boletas.length > 0);
  const noResults = !loading && results !== null && !hasResults && query.trim().length >= 2;
  const showRecent = !query.trim() && recentSearches.length > 0;

  const PILLS: Array<{ tipo: Exclude<SearchTipo, "auto">; label: string; icon: string }> = [
    { tipo: "cliente", label: "Cliente", icon: "👤" },
    { tipo: "llamada", label: "# Llamada", icon: "📞" },
    { tipo: "boleta", label: "# Boleta", icon: "📋" },
  ];

  const placeholder =
    tipo === "cliente" ? "Buscar por nombre de cliente..."
    : tipo === "llamada" ? "Buscar por número de llamada SAP..."
    : tipo === "boleta" ? "Buscar por número de boleta..."
    : "Buscar por cliente, # llamada o # boleta...";

  return (
    <div ref={containerRef} className="space-y-2.5">

      {/* ── Search input ─────────────────────────────────────────────────────── */}
      <div className="relative z-30">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#555] pointer-events-none z-10" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full h-10 rounded-full border border-[#2A2A2A] bg-[#1C1C1C] pl-10 pr-9 text-sm text-foreground placeholder:text-[#555] focus:outline-none focus:ring-1 focus:ring-[#CC0000]/40 focus:border-[#CC0000]/40 transition-colors"
        />
        {loading && (
          <div className="absolute right-9 top-1/2 -translate-y-1/2 h-3.5 w-3.5 border border-[#555] border-t-[#CC0000] rounded-full animate-spin pointer-events-none" />
        )}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-foreground transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* ── Dropdown ──────────────────────────────────────────────────────── */}
        {showDropdown && (showRecent || loading || hasResults || noResults) && (
          <div className="absolute top-full mt-1.5 left-0 right-0 rounded-xl border border-[#2A2A2A] bg-[#161616] shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">

            {/* Recent searches */}
            {showRecent && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-[#555] uppercase tracking-widest">
                  Búsquedas recientes
                </p>
                {recentSearches.map((s) => (
                  <button
                    key={s}
                    onMouseDown={(e) => { e.preventDefault(); handleQueryChange(s.replace(/^Boleta #/, "").replace(/^#/, "")); }}
                    className="w-full text-left px-4 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors"
                  >
                    <Clock className="h-3.5 w-3.5 text-[#444] shrink-0" />
                    <span className="text-sm text-[#9A9A9A]">{s}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Loading */}
            {loading && query.trim().length >= 2 && (
              <div className="px-4 py-5 flex items-center justify-center gap-2 text-xs text-[#555]">
                <div className="h-3 w-3 border border-[#555] border-t-[#CC0000] rounded-full animate-spin" />
                Buscando...
              </div>
            )}

            {/* No results */}
            {noResults && (
              <div className="px-4 py-6 text-center text-xs text-[#555]">
                Sin resultados para{" "}
                <span className="text-[#9A9A9A] font-medium">"{query}"</span>
              </div>
            )}

            {/* Clientes section */}
            {results && results.clientes.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-[#555] uppercase tracking-widest flex items-center gap-1.5">
                  <User2 className="h-3 w-3" />Clientes
                </p>
                {results.clientes.map((c) => (
                  <button
                    key={c.id}
                    onMouseDown={(e) => { e.preventDefault(); void handleSelectCliente(c); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center justify-between border-b border-[#1C1C1C] last:border-0"
                  >
                    <p className="text-sm text-white font-medium">{c.nombre_comercial}</p>
                    <ChevronRight className="h-3.5 w-3.5 text-[#444]" />
                  </button>
                ))}
              </div>
            )}

            {/* Llamadas section */}
            {results && results.llamadas.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-[#555] uppercase tracking-widest flex items-center gap-1.5">
                  <Phone className="h-3 w-3" />
                  Llamadas SAP
                  <span className="text-[#444] normal-case font-normal ml-1">
                    — {results.llamadas.length} resultado{results.llamadas.length !== 1 ? "s" : ""}
                  </span>
                </p>
                {results.llamadas.map((l) => (
                  <button
                    key={l.numero}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectLlamada(l.numero); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors flex items-center justify-between border-b border-[#1C1C1C] last:border-0"
                  >
                    <span className="text-sm font-mono text-white">#{l.numero}</span>
                    <div className="text-right">
                      <p className="text-[11px] text-[#9A9A9A]">
                        {l.boletas_count} boleta{l.boletas_count !== 1 ? "s" : ""}
                      </p>
                      {l.clientes.length > 0 && (
                        <p className="text-[10px] text-[#555] truncate max-w-[200px]">
                          {l.clientes.join(", ")}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Boletas section */}
            {results && results.boletas.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-[#555] uppercase tracking-widest flex items-center gap-1.5">
                  <ClipboardList className="h-3 w-3" />
                  Boletas
                  <span className="text-[#444] normal-case font-normal ml-1">
                    — {results.boletas.length} resultado{results.boletas.length !== 1 ? "s" : ""}
                  </span>
                </p>
                {results.boletas.map((b) => (
                  <button
                    key={b.id}
                    onMouseDown={(e) => { e.preventDefault(); handleSelectBoleta(b); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-white/5 transition-colors border-b border-[#1C1C1C] last:border-0"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-white">Boleta #{b.numero_reporte}</span>
                      <EstadoBadge estado={b.estado_revision} />
                    </div>
                    <p className="text-[11px] text-[#9A9A9A] mt-0.5">{b.cliente_nombre}</p>
                    {b.tecnico_nombre && (
                      <p className="text-[10px] text-[#555]">Técnico: {b.tecnico_nombre}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Filter pills ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        {PILLS.map(({ tipo: t, label, icon }) => (
          <button
            key={t}
            onClick={() => handleTogglePill(t)}
            className={`rounded-full border px-3 py-1 text-[10px] font-semibold transition-colors ${
              tipo === t
                ? "border-[#CC0000]/50 bg-[#CC0000]/10 text-[#CC0000]"
                : "border-[#2A2A2A] bg-[#1C1C1C] text-[#555] hover:text-foreground hover:border-[#444]"
            }`}
          >
            {icon} {label}
          </button>
        ))}
        {tipo !== "auto" && (
          <span className="text-[10px] text-[#444] ml-1">
            Modo: {PILLS.find((p) => p.tipo === tipo)?.label} — click para quitar filtro
          </span>
        )}
      </div>

      {/* ── Client llamadas panel ─────────────────────────────────────────────── */}
      {clienteLlamadas && (
        <div className="rounded-xl border border-[#2A2A2A] bg-[#161616] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[#9A9A9A]">
              📞 Llamadas SAP —{" "}
              <span className="text-white">{clienteLlamadas.cliente.nombre_comercial}</span>
            </p>
            <button
              onClick={() => { setClienteLlamadas(null); setQuery(""); }}
              className="text-[#555] hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {clienteLlamadas.loading ? (
            <div className="flex items-center gap-2 text-xs text-[#555]">
              <div className="h-3 w-3 border border-[#555] border-t-[#CC0000] rounded-full animate-spin" />
              Buscando llamadas SAP...
            </div>
          ) : clienteLlamadas.llamadas.length === 0 ? (
            <p className="text-xs text-[#555]">
              No hay boletas con llamada SAP registradas para este cliente
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {clienteLlamadas.llamadas.map((n) => (
                <button
                  key={n}
                  onClick={() => handleSelectLlamada(n)}
                  className="rounded-full border border-[#2A2A2A] bg-[#1C1C1C] px-3 py-1.5 text-xs font-mono text-[#9A9A9A] hover:border-[#CC0000]/40 hover:text-white transition-colors"
                >
                  #{n}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Boleta detail card ───────────────────────────────────────────────── */}
      {selectedBoleta && (
        <BoletaDetailCard
          boleta={selectedBoleta}
          onClose={() => setSelectedBoleta(null)}
          onViewSap={
            selectedBoleta.numero_llamada
              ? () => { setSelectedBoleta(null); onSapSelect(selectedBoleta.numero_llamada!); }
              : undefined
          }
        />
      )}
    </div>
  );
}
