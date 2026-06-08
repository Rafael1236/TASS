import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Footer } from "@/components/Footer";
import { SignatureModal } from "@/components/SignatureModal";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/apiBase";
import type { SignatureData } from "@/lib/signature";
import { useTheme } from "@/context/ThemeContext";

// Platform.OS is typed as the native union ("ios"|"android"|...); cast for web builds
const IS_WEB = (Platform.OS as string) === "web";

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPOS_SERVICIO = [
  "Mantenimiento", "Soporte", "Instalación", "Reparación",
  "Cableado", "Programación", "Capacitación", "Garantía",
  "Estudio", "Entrega",
];

const PLACAS = [
  "P3897A", "P389AA", "P62FA0", "P62FFA",
  "P62FF2", "P62FAF", "P5176A", "P963771",
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientResult {
  id: string;
  nombre_comercial: string;
  es_sucursal: boolean;
  sucursales: Array<{ id: string; nombre_comercial: string; display_name: string }>;
}

interface TecnicoListItem {
  id: string;
  nombre: string;
  departamento?: string;
}

interface TecnicoAux {
  uid: string;
  nombre: string;
  horaEntrada: string;
  horaSalida: string;
}

// ── Debounce hook ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return d;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcHours(entrada: string, salida: string): number | null {
  const parseTime = (t: string) => {
    const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return parseInt(m[1]!) * 60 + parseInt(m[2]!);
  };
  const e = parseTime(entrada);
  const s = parseTime(salida);
  if (e === null || s === null) return null;
  const diff = (s - e) / 60;
  return diff > 0 ? Math.round(diff * 10) / 10 : null;
}

function formatTimeInput(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

async function uriToBase64DataUrl(uri: string): Promise<string | null> {
  try {
    if (uri.startsWith("data:")) return uri;
    const res = await fetch(uri);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ── Photo helpers ─────────────────────────────────────────────────────────────

async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") { Alert.alert("Permiso requerido", "Se necesita acceso a la galería."); return null; }
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "images", quality: 0.7, base64: true, allowsEditing: false });
  if (r.canceled || !r.assets[0]) return null;
  const asset = r.assets[0];
  if (asset.base64) return `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
  return null;
}

async function takePhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") { Alert.alert("Permiso requerido", "Se necesita acceso a la cámara."); return null; }
  const r = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
  if (r.canceled || !r.assets[0]) return null;
  const asset = r.assets[0];
  if (asset.base64) return `data:${asset.mimeType ?? "image/jpeg"};base64,${asset.base64}`;
  return null;
}

function showPhotoOptions(onResult: (uri: string | null) => void) {
  if (IS_WEB) { pickImage().then(onResult); return; }
  Alert.alert("Agregar foto", "¿Cómo deseas agregar la foto?", [
    { text: "Cámara", onPress: () => takePhoto().then(onResult) },
    { text: "Galería", onPress: () => pickImage().then(onResult) },
    { text: "Cancelar", style: "cancel", onPress: () => onResult(null) },
  ]);
}


// ── Section header ────────────────────────────────────────────────────────────

function SectionCard({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[s.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[s.sectionHeader, { backgroundColor: colors.cardAlt, borderBottomColor: colors.divider }]}>
        <View style={s.sectionNum}><Text style={s.sectionNumText}>{number}</Text></View>
        <Text style={[s.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ── Label ─────────────────────────────────────────────────────────────────────

function FieldLabel({ text, required }: { text: string; required?: boolean }) {
  const { colors } = useTheme();
  return (
    <Text style={[s.label, { color: colors.textSecondary }]}>
      {text}{required && <Text style={s.required}> *</Text>}
    </Text>
  );
}

// ── Time picker ───────────────────────────────────────────────────────────────

function parseTo12(v: string): { hour12: number; minute: number; ampm: "AM" | "PM" } {
  const [hStr, mStr] = v.split(":");
  const h = parseInt(hStr ?? "8", 10);
  const m = parseInt(mStr ?? "0", 10);
  if (isNaN(h)) return { hour12: 8, minute: 0, ampm: "AM" };
  const ampm: "AM" | "PM" = h < 12 ? "AM" : "PM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { hour12, minute: isNaN(m) ? 0 : m, ampm };
}

function to24(hour12: number, minute: number, ampm: "AM" | "PM"): string {
  let h = hour12 === 12 ? 0 : hour12;
  if (ampm === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { hour12, minute, ampm } = value ? parseTo12(value) : { hour12: 8, minute: 0, ampm: "AM" as const };
  const displayTime = value
    ? `${String(hour12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${ampm}`
    : "— : —";

  return (
    <View style={s.timePicker}>
      <Text style={s.timePickerDisplay}>{displayTime}</Text>
      <View style={s.timePickerRow}>
        {[1, 2, 3, 4, 5, 6].map((h) => (
          <Pressable
            key={h}
            style={[s.timePickerBtn, hour12 === h && s.timePickerBtnHourActive]}
            onPress={() => onChange(to24(h, minute, ampm))}
          >
            <Text style={[s.timePickerBtnText, hour12 === h && s.timePickerBtnHourTextActive]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.timePickerRow}>
        {[7, 8, 9, 10, 11, 12].map((h) => (
          <Pressable
            key={h}
            style={[s.timePickerBtn, hour12 === h && s.timePickerBtnHourActive]}
            onPress={() => onChange(to24(h, minute, ampm))}
          >
            <Text style={[s.timePickerBtnText, hour12 === h && s.timePickerBtnHourTextActive]}>{h}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.timePickerRow}>
        {[0, 15, 30, 45].map((m) => (
          <Pressable
            key={m}
            style={[s.timePickerBtn, { flex: 1.5 }, minute === m && s.timePickerBtnMinActive]}
            onPress={() => onChange(to24(hour12, m, ampm))}
          >
            <Text style={[s.timePickerBtnText, minute === m && s.timePickerBtnMinTextActive]}>
              :{String(m).padStart(2, "0")}
            </Text>
          </Pressable>
        ))}
        {(["AM", "PM"] as const).map((ap) => (
          <Pressable
            key={ap}
            style={[s.timePickerBtn, ampm === ap && s.timePickerBtnAmpmActive]}
            onPress={() => onChange(to24(hour12, minute, ap))}
          >
            <Text style={[s.timePickerBtnText, ampm === ap && s.timePickerBtnAmpmTextActive]}>{ap}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ── TextAreaField ─────────────────────────────────────────────────────────────

function TextAreaField({
  label, required, value, onChange, placeholder,
}: {
  label: string; required?: boolean; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[s.fieldWrap, { borderBottomColor: colors.divider }]}>
      <FieldLabel text={label} required={required} />
      <TextInput
        style={[s.textarea, { backgroundColor: colors.input, borderColor: colors.inputBorder, color: colors.text }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder ?? `${label}…`}
        placeholderTextColor={colors.textPlaceholder}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
    </View>
  );
}

// ── YesNo chip row ─────────────────────────────────────────────────────────────

function YesNoChips({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <View style={s.chipRow}>
      {([true, false] as const).map((opt) => {
        const sel = value === opt;
        return (
          <Pressable
            key={String(opt)}
            style={[s.chip, sel && s.chipSelected]}
            onPress={() => { if (!IS_WEB) Haptics.selectionAsync(); onChange(opt); }}
          >
            <Text style={[s.chipText, sel && s.chipTextSelected]}>{opt ? "Sí" : "No"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Photo thumbnail ───────────────────────────────────────────────────────────

function PhotoThumb({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View style={s.photoThumbOuter}>
      <View style={s.photoThumb}>
        <Image source={{ uri }} style={s.photoImg} />
      </View>
      <Pressable style={s.photoRemove} onPress={onRemove} hitSlop={4}>
        <Ionicons name="close-circle" size={22} color="#CC0000" />
      </Pressable>
    </View>
  );
}

// ── Aux technician card ───────────────────────────────────────────────────────

function TecnicoCard({
  tech, onRemove, onChangeEntrada, onChangeSalida,
}: {
  tech: TecnicoAux;
  onRemove: () => void;
  onChangeEntrada: (v: string) => void;
  onChangeSalida: (v: string) => void;
}) {
  const hours = calcHours(tech.horaEntrada, tech.horaSalida);
  return (
    <View style={s.techCard}>
      <View style={s.techCardHeader}>
        <View style={s.techIcon}><Ionicons name="person" size={14} color="#CC0000" /></View>
        <Text style={s.techCardName} numberOfLines={1}>{tech.nombre}</Text>
        <Pressable onPress={onRemove} hitSlop={8}><Ionicons name="close" size={18} color="#555" /></Pressable>
      </View>
      <View style={s.techCardTimes}>
        <View style={s.techTimeBlock}>
          <Text style={s.techTimeLabel}>Entrada</Text>
          <TimePicker value={tech.horaEntrada} onChange={onChangeEntrada} />
        </View>
        <View style={[s.techTimeBlock, { marginTop: 10 }]}>
          <Text style={s.techTimeLabel}>Salida</Text>
          <TimePicker value={tech.horaSalida} onChange={onChangeSalida} />
        </View>
        {hours !== null && (
          <View style={[s.techHours, { alignSelf: "flex-start", marginTop: 8 }]}>
            <Text style={s.techHoursText}>{hours}h</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Technician search modal ───────────────────────────────────────────────────

function TecnicoSearchModal({
  visible, onClose, onSelect, excludeNombre, alreadyAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (nombre: string) => void;
  excludeNombre: string;
  alreadyAdded: string[];
}) {
  const [query, setQuery] = useState("");
  const [tecnicos, setTecnicos] = useState<TecnicoListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const dq = useDebounce(query, 300);
  const api = getApiBase();

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setQuery("");
      setTecnicos([]);
      setSearched(false);
    }
  }, [visible]);

  // Live search on debounced query
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    fetch(`${api}/tecnicos/search?q=${encodeURIComponent(dq)}`)
      .then((r) => r.json() as Promise<{ success: boolean; tecnicos?: TecnicoListItem[] }>)
      .then((j) => {
        if (cancelled) return;
        setTecnicos(j.success ? (j.tecnicos ?? []) : []);
        setSearched(true);
      })
      .catch(() => { if (!cancelled) { setTecnicos([]); setSearched(true); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dq, visible, api]);

  // Filter out the principal technician and already-added ones
  const excludeSet = new Set([
    excludeNombre.trim().toLowerCase(),
    ...alreadyAdded.map((n) => n.trim().toLowerCase()),
  ]);
  const filtered = tecnicos.filter((t) => !excludeSet.has(t.nombre.trim().toLowerCase()));

  const showEmpty = searched && !loading && filtered.length === 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"} onRequestClose={onClose}>
      <View style={sm.root}>
        <View style={sm.header}>
          <Text style={sm.title}>Agregar técnico TAS</Text>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={24} color="#E0E0E0" /></Pressable>
        </View>

        <View style={sm.searchWrap}>
          <Ionicons name="search" size={16} color={loading ? "#CC0000" : "#3A3A3A"} />
          <TextInput
            style={sm.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar por nombre…"
            placeholderTextColor="#3A3A3A"
            autoFocus
            autoCorrect={false}
          />
          {loading && <ActivityIndicator color="#CC0000" size="small" />}
        </View>

        {showEmpty ? (
          <View style={sm.center}>
            <Ionicons name="person-outline" size={36} color="#2A2A2A" />
            <Text style={sm.emptyText}>No se encontró ningún técnico</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(t) => t.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={filtered.length === 0 ? { flex: 1 } : undefined}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [sm.row, pressed && sm.rowPressed]}
                onPress={() => { onSelect(item.nombre); onClose(); }}
              >
                <View style={sm.iconWrap}>
                  <Ionicons name="person" size={15} color="#CC0000" />
                </View>
                <View style={sm.rowTexts}>
                  <Text style={sm.rowName}>{item.nombre}</Text>
                  {!!item.departamento && (
                    <Text style={sm.rowDept}>{item.departamento}</Text>
                  )}
                </View>
                <Ionicons name="add-circle-outline" size={20} color="#CC0000" />
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const sm = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderBottomColor: "#2A2A2A",
  },
  title: { color: "#F0F0F0", fontFamily: "Inter_600SemiBold", fontSize: 17 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#161616",
    margin: 12, borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
    paddingHorizontal: 12, gap: 8,
  },
  searchInput: {
    flex: 1, color: "#F0F0F0", fontFamily: "Inter_400Regular", fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { color: "#3A3A3A", fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1E1E1E", gap: 12,
  },
  rowPressed: { backgroundColor: "#161616" },
  iconWrap: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(204,0,0,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  rowTexts: { flex: 1 },
  rowName: { color: "#F0F0F0", fontFamily: "Inter_600SemiBold", fontSize: 15 },
  rowDept: { color: "#4A4A4A", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});

// ── Placa picker modal ────────────────────────────────────────────────────────

function PlacaModal({ visible, selected, onSelect, onClose }: { visible: boolean; selected: string; onSelect: (p: string) => void; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={pm.overlay} onPress={onClose}>
        <View style={pm.sheet}>
          <Text style={pm.sheetTitle}>Vehículo (placa)</Text>
          {PLACAS.map((p) => (
            <Pressable
              key={p}
              style={[pm.item, selected === p && pm.itemSelected]}
              onPress={() => { onSelect(p); onClose(); }}
            >
              <Text style={[pm.itemText, selected === p && pm.itemTextSelected]}>{p}</Text>
              {selected === p && <Ionicons name="checkmark" size={16} color="#CC0000" />}
            </Pressable>
          ))}
          <Pressable style={pm.clearBtn} onPress={() => { onSelect(""); onClose(); }}>
            <Text style={pm.clearText}>Sin vehículo</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const pm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center", alignItems: "center", padding: 24 },
  sheet: { backgroundColor: "#161616", borderRadius: 16, padding: 8, width: "100%", borderWidth: 1, borderColor: "#2A2A2A" },
  sheetTitle: { color: "#9A9A9A", fontFamily: "Inter_600SemiBold", fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", padding: 12, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8 },
  itemSelected: { backgroundColor: "rgba(204,0,0,0.08)" },
  itemText: { color: "#E0E0E0", fontFamily: "Inter_500Medium", fontSize: 15 },
  itemTextSelected: { color: "#CC0000" },
  clearBtn: { borderTopWidth: 1, borderTopColor: "#2A2A2A", paddingVertical: 12, alignItems: "center", marginTop: 4 },
  clearText: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14 },
});

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <View style={s.progressWrap}>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` as `${number}%` }]} />
      </View>
      <Text style={s.progressText}>{pct}% completado</Text>
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NuevaBoletaScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tecnico } = useAuth();
  const { colors } = useTheme();
  const api = getApiBase();

  // ── State: Section 1 ───────────────────────────────────────────────────────
  const [clienteSeleccionado, setClienteSeleccionado] = useState<{ id: string; nombre: string } | null>(null);
  const [clienteQuery, setClienteQuery] = useState("");
  const [clienteResults, setClienteResults] = useState<ClientResult[]>([]);
  const [clienteSearching, setClienteSearching] = useState(false);
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const [clienteCreandose, setClienteCreandose] = useState(false);
  const [clienteNuevoMsg, setClienteNuevoMsg] = useState<string | null>(null);
  const [correoClienteManual, setCorreoClienteManual] = useState("");
  const [numeroLlamada, setNumeroLlamada] = useState("");
  const [numeroProyecto, setNumeroProyecto] = useState("");
  const [tiposServicio, setTiposServicio] = useState<string[]>([]);
  const [placa, setPlaca] = useState("");
  const [placaModalVisible, setPlacaModalVisible] = useState(false);

  // ── State: Section 2 ───────────────────────────────────────────────────────
  const [trabajo, setTrabajo] = useState("");
  const [equipos, setEquipos] = useState("");
  const [materiales, setMateriales] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // ── State: Section 3 ───────────────────────────────────────────────────────
  const [horaEntrada, setHoraEntrada] = useState("");
  const [horaSalida, setHoraSalida] = useState("");
  const [tecnicosAux, setTecnicosAux] = useState<TecnicoAux[]>([]);
  const [techModalVisible, setTechModalVisible] = useState(false);
  const [haySubcontrato, setHaySubcontrato] = useState<boolean | null>(null);
  const [cantidadSubcontrato, setCantidadSubcontrato] = useState("");
  // Supervisor asignado
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [supervisorNombre, setSupervisorNombre] = useState("");
  const [supervisores, setSupervisores] = useState<{ id: string; nombre: string; rol: string; correo: string }[]>([]);
  const [supervisorDropdownOpen, setSupervisorDropdownOpen] = useState(false);

  // ── State: Section 4 ───────────────────────────────────────────────────────
  const [estadoServicio, setEstadoServicio] = useState<string | null>(null);

  // ── State: Section 5 ───────────────────────────────────────────────────────
  const [hayCotizacion, setHayCotizacion] = useState<boolean | null>(null);
  const [descripcionCotizacion, setDescripcionCotizacion] = useState("");

  // ── State: Section 6 ───────────────────────────────────────────────────────
  const [fotos, setFotos] = useState<string[]>([]);
  const [firma, setFirma] = useState<SignatureData | null>(null);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  // ── State: UI ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // ── Supervisor list (fetch once on mount) ────────────────────────────────
  useEffect(() => {
    fetch(`${api}/dashboard/supervisores`)
      .then((r) => r.json() as Promise<{ success?: boolean; supervisores?: { id: string; nombre: string }[] }>)
      .then((j) => { if (j.success && j.supervisores) setSupervisores(j.supervisores); })
      .catch(() => {});
  }, [api]);

  // ── Client search ─────────────────────────────────────────────────────────
  const debouncedQuery = useDebounce(clienteQuery, 350);

  useEffect(() => {
    if (clienteSeleccionado) return;
    if (debouncedQuery.length < 2) { setClienteResults([]); setClienteDropdownOpen(false); return; }
    let cancelled = false;
    setClienteSearching(true);
    fetch(`${api}/clients/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json() as Promise<{ clients?: ClientResult[] }>)
      .then((j) => {
        if (!cancelled) {
          setClienteResults(j.clients ?? []);
          setClienteDropdownOpen(true);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setClienteSearching(false); });
    return () => { cancelled = true; };
  }, [debouncedQuery, clienteSeleccionado, api]);

  const selectCliente = useCallback((id: string, nombre: string) => {
    setClienteSeleccionado({ id, nombre });
    setClienteQuery(nombre);
    setClienteDropdownOpen(false);
    setClienteResults([]);
  }, []);

  const clearCliente = useCallback(() => {
    setClienteSeleccionado(null);
    setClienteQuery("");
    setClienteResults([]);
    setClienteDropdownOpen(false);
    setClienteNuevoMsg(null);
  }, []);

  const crearNuevoCliente = useCallback(async (nombre: string) => {
    if (!nombre.trim()) return;
    setClienteCreandose(true);
    setClienteDropdownOpen(false);
    try {
      const res = await fetch(`${api}/clients/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_comercial: nombre.trim(),
          creado_por: (tecnico as { nombre?: string } | null)?.nombre ?? "Técnico",
        }),
      });
      const j = await res.json() as { success?: boolean; cliente?: { id: string; nombre_comercial: string }; error?: string };
      if (j.success && j.cliente) {
        selectCliente(j.cliente.id, j.cliente.nombre_comercial);
        setClienteNuevoMsg("✓ Cliente creado. El equipo de operaciones fue notificado para completar sus datos.");
      } else {
        Alert.alert("Error al crear cliente", j.error ?? "No se pudo crear el cliente. Intenta de nuevo.");
      }
    } catch {
      Alert.alert("Error de conexión", "No se pudo crear el cliente. Verifica tu red e intenta de nuevo.");
    } finally {
      setClienteCreandose(false);
    }
  }, [api, tecnico, selectCliente]);

  // ── Tipo servicio toggle ──────────────────────────────────────────────────
  const toggleTipo = useCallback((t: string) => {
    if (!IS_WEB) Haptics.selectionAsync();
    setTiposServicio((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  }, []);

  // IS_WEB used below for haptic guards

  // ── Aux technician management ─────────────────────────────────────────────
  const addTecnicoAux = useCallback((nombre: string) => {
    setTecnicosAux((prev) => {
      if (prev.some((t) => t.nombre === nombre)) return prev;
      return [...prev, { uid: `${Date.now()}-${Math.random()}`, nombre, horaEntrada: "", horaSalida: "" }];
    });
  }, []);

  const removeTecnicoAux = useCallback((uid: string) => {
    setTecnicosAux((prev) => prev.filter((t) => t.uid !== uid));
  }, []);

  const updateTecnicoAux = useCallback((uid: string, field: "horaEntrada" | "horaSalida", value: string) => {
    setTecnicosAux((prev) => prev.map((t) => t.uid === uid ? { ...t, [field]: formatTimeInput(value) } : t));
  }, []);

  // ── Progress calculation ──────────────────────────────────────────────────
  const requiredFields = [
    !!clienteSeleccionado,
    tiposServicio.length > 0,
    !!trabajo.trim(),
    !!estadoServicio,
    !!horaEntrada.trim(),
    !!horaSalida.trim(),
    !!supervisorId,
  ];
  const completedCount = requiredFields.filter(Boolean).length;
  const progress = completedCount / requiredFields.length;
  const canSubmit = requiredFields.every(Boolean);

  // ── Aux hours summary ─────────────────────────────────────────────────────
  const principalHours = calcHours(horaEntrada, horaSalida);
  const allHours = [
    principalHours,
    ...tecnicosAux.map((t) => calcHours(t.horaEntrada, t.horaSalida)),
  ].filter((h): h is number => h !== null);
  const totalHorasEquipo = allHours.length > 0 ? Math.round(allHours.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) {
      Alert.alert("Campos requeridos", "Por favor completa todos los campos marcados con *");
      return;
    }
    if (!IS_WEB) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSubmitting(true);
    try {
      const photos: Array<{ base64DataUrl: string }> = [];
      for (const uri of fotos) {
        const dataUrl = await uriToBase64DataUrl(uri);
        if (dataUrl) photos.push({ base64DataUrl: dataUrl });
      }

      const allTecnicos = [
        {
          nombre: tecnico?.nombre ?? "",
          es_subcontrato: false,
          es_principal: true,
          hora_entrada: horaEntrada || undefined,
          hora_salida: horaSalida || undefined,
          total_horas: principalHours ?? undefined,
        },
        ...tecnicosAux.map((t) => {
          const h = calcHours(t.horaEntrada, t.horaSalida);
          return {
            nombre: t.nombre,
            es_subcontrato: false,
            es_principal: false,
            hora_entrada: t.horaEntrada || undefined,
            hora_salida: t.horaSalida || undefined,
            total_horas: h ?? undefined,
          };
        }),
      ];

      const body: Record<string, unknown> = {
        cliente_nombre: clienteSeleccionado!.nombre,
        tecnico_nombre: tecnico?.nombre ?? "",
        numero_llamada: numeroLlamada.trim() || undefined,
        numero_proyecto: numeroProyecto.trim() || undefined,
        tipo_servicio: tiposServicio.join(", "),
        trabajo_realizado: trabajo.trim(),
        equipos_instalados: equipos.trim() || undefined,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        estado_servicio: estadoServicio,
        hay_cotizacion: hayCotizacion === true,
        descripcion_cotizacion: descripcionCotizacion.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
        es_subcontrato: haySubcontrato === true,
        cantidad_subcontrato: haySubcontrato && cantidadSubcontrato ? parseInt(cantidadSubcontrato, 10) || null : null,
        correo_cliente: correoClienteManual.trim() || undefined,
        placa_vehiculo: placa || undefined,
        tecnicos: allTecnicos,
        repuestos: materiales.trim()
          ? materiales.split("\n").filter(Boolean).map((line) => {
              const m = line.match(/^(\d+(?:\.\d+)?)\s*[xX×-]\s*(.+)$/);
              return m ? { cantidad: m[1], descripcion: m[2]!.trim() } : { descripcion: line.trim() };
            })
          : [],
        photos,
        total_horas_equipo: totalHorasEquipo ?? undefined,
        supervisor_id: supervisorId ?? undefined,
        supervisor_nombre: supervisorNombre || undefined,
      };

      if (firma?.dataUrl) body["firma_data_url"] = firma.dataUrl;

      const res = await fetch(`${api}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (json.ok) {
        setSuccess(true);
      } else {
        Alert.alert("Error al enviar", json.error ?? "No se pudo guardar el reporte. Intenta de nuevo.");
      }
    } catch (e) {
      Alert.alert("Error de conexión", "Verifica tu red e intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const topPad = IS_WEB ? Math.max(insets.top, 44) : insets.top;
  const botPad = Math.max(insets.bottom, 16);

  // ── Success screen ────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={[s.root, { paddingTop: topPad, backgroundColor: colors.bgDeep }]}>
        <View style={s.center}>
          <Ionicons name="checkmark-circle" size={80} color="#1D9E75" />
          <Text style={s.successTitle}>¡Reporte enviado!</Text>
          <Text style={s.successSub}>La boleta fue registrada correctamente y el cliente fue notificado.</Text>
          <Pressable style={s.successBtnRed} onPress={() => router.replace("/tas" as never)}>
            <Text style={s.successBtnText}>Ir al inicio</Text>
          </Pressable>
          <Pressable style={s.successBtnOutline} onPress={() => {
            setSuccess(false);
            setClienteSeleccionado(null); setClienteQuery(""); setNumeroLlamada(""); setNumeroProyecto("");
            setTiposServicio([]); setPlaca(""); setTrabajo(""); setEquipos(""); setMateriales(""); setObservaciones("");
            setHoraEntrada(""); setHoraSalida(""); setTecnicosAux([]); setHaySubcontrato(null); setCantidadSubcontrato("");
            setEstadoServicio(null); setHayCotizacion(null); setDescripcionCotizacion(""); setFotos([]); setFirma(null);
          }}>
            <Text style={s.successBtnOutlineText}>Nueva boleta</Text>
          </Pressable>
        </View>
        <Footer />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: topPad }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <Pressable style={s.backPill} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
          <Text style={s.backPillText}>Inicio</Text>
        </Pressable>
        <Text style={s.headerTitle}>Nueva Boleta de Servicio</Text>
        <View style={{ width: 72 }} />
      </View>

      {/* ── Progress bar ── */}
      <ProgressBar progress={progress} />

      {/* ── Form ── */}
      <ScrollView
        contentContainerStyle={[s.scroll, { paddingBottom: botPad + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ══ SECTION 1: Identificación ══ */}
        <SectionCard number={1} title="Identificación">

          {/* Cliente */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Cliente" required />
            <View>
              <View style={[s.inputRow, clienteSeleccionado && s.inputRowSelected]}>
                <Ionicons name="business-outline" size={16} color={clienteSeleccionado ? "#CC0000" : "#3A3A3A"} />
                <TextInput
                  style={[s.inputFlex, clienteSeleccionado && { color: "#FFFFFF" }]}
                  value={clienteQuery}
                  onChangeText={(t) => {
                    setClienteQuery(t);
                    if (clienteSeleccionado) clearCliente();
                  }}
                  placeholder="Buscar cliente…"
                  placeholderTextColor="#3A3A3A"
                  autoCorrect={false}
                />
                {clienteSearching && <ActivityIndicator color="#CC0000" size="small" />}
                {clienteSeleccionado && (
                  <Pressable onPress={clearCliente} hitSlop={8}>
                    <Ionicons name="close-circle" size={18} color="#555" />
                  </Pressable>
                )}
              </View>
              {(clienteDropdownOpen || clienteSearching) && !clienteSeleccionado && !clienteCreandose && (
                <View style={s.dropdown}>
                  {clienteSearching ? (
                    <View style={[s.dropdownRow, { justifyContent: "center" }]}>
                      <ActivityIndicator color="#CC0000" size="small" />
                    </View>
                  ) : (
                    <View>
                      <ScrollView
                        style={s.dropdownScroll}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                      >
                        {clienteResults.map((c) => (
                          <View key={c.id}>
                            <Pressable
                              style={({ pressed }) => [s.dropdownRow, pressed && s.dropdownRowPressed]}
                              onPress={() => selectCliente(c.id, c.nombre_comercial)}
                            >
                              <Ionicons name={c.sucursales.length > 0 ? "business-outline" : "person-outline"} size={14} color="#CC0000" />
                              <Text style={s.dropdownText} numberOfLines={1}>{c.nombre_comercial}</Text>
                            </Pressable>
                            {c.sucursales.map((suc) => (
                              <Pressable
                                key={suc.id}
                                style={({ pressed }) => [s.dropdownRow, s.dropdownSubRow, pressed && s.dropdownRowPressed]}
                                onPress={() => selectCliente(suc.id, suc.nombre_comercial)}
                              >
                                <Ionicons name="git-branch-outline" size={13} color="#3A3A3A" />
                                <Text style={[s.dropdownText, s.dropdownSubText]} numberOfLines={1}>↳ {suc.display_name}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ))}
                      </ScrollView>
                      <Pressable
                        style={({ pressed }) => [s.dropdownRow, s.addClientRow, pressed && s.dropdownRowPressed]}
                        onPress={() => {
                          Alert.alert(
                            "¿Agregar nuevo cliente?",
                            `Se creará el cliente "${debouncedQuery}" y se notificará al equipo de operaciones para completar sus datos.`,
                            [
                              { text: "Cancelar", style: "cancel" },
                              { text: "Sí, agregar", style: "default", onPress: () => { void crearNuevoCliente(debouncedQuery); } },
                            ]
                          );
                        }}
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#1D9E75" />
                        <Text style={s.addClientText} numberOfLines={1}>
                          Agregar nuevo: &ldquo;{debouncedQuery}&rdquo;
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}
              {clienteCreandose && (
                <View style={s.clienteCreandoWrap}>
                  <ActivityIndicator color="#1D9E75" size="small" />
                  <Text style={s.clienteCreandoText}>Creando cliente…</Text>
                </View>
              )}
              {clienteNuevoMsg && (
                <View style={s.clienteNuevoMsg}>
                  <Ionicons name="checkmark-circle" size={14} color="#1D9E75" />
                  <Text style={s.clienteNuevoMsgText}>{clienteNuevoMsg}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Correo del cliente */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Correo del cliente" />
            <Text style={s.fieldHint}>(opcional — para envío del reporte)</Text>
            <View style={s.inputRow}>
              <Ionicons name="mail-outline" size={16} color="#3A3A3A" />
              <TextInput
                style={s.inputFlex}
                value={correoClienteManual}
                onChangeText={setCorreoClienteManual}
                placeholder="correo@cliente.com"
                placeholderTextColor="#3A3A3A"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* # Llamada SAP */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Número de llamada SAP" />
            <View style={s.inputRow}>
              <Ionicons name="call-outline" size={16} color="#3A3A3A" />
              <TextInput
                style={s.inputFlex}
                value={numeroLlamada}
                onChangeText={setNumeroLlamada}
                placeholder="Ej. 123456 (opcional)"
                placeholderTextColor="#3A3A3A"
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* # Proyecto */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Número de proyecto" />
            <View style={s.inputRow}>
              <Ionicons name="folder-outline" size={16} color="#3A3A3A" />
              <TextInput
                style={s.inputFlex}
                value={numeroProyecto}
                onChangeText={setNumeroProyecto}
                placeholder="Opcional"
                placeholderTextColor="#3A3A3A"
              />
            </View>
          </View>

          {/* Tipo de servicio */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Tipo de servicio" required />
            <View style={s.chipGrid}>
              {TIPOS_SERVICIO.map((t) => {
                const sel = tiposServicio.includes(t);
                return (
                  <Pressable
                    key={t}
                    style={[s.chip, sel && s.chipSelected]}
                    onPress={() => toggleTipo(t)}
                  >
                    <Text style={[s.chipText, sel && s.chipTextSelected]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Vehículo */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Vehículo (placa)" />
            <Pressable style={s.inputRow} onPress={() => setPlacaModalVisible(true)}>
              <Ionicons name="car-outline" size={16} color={placa ? "#CC0000" : "#3A3A3A"} />
              <Text style={[s.inputFlex, { color: placa ? "#FFFFFF" : "#3A3A3A", paddingVertical: Platform.OS === "ios" ? 12 : 8 }]}>
                {placa || "Seleccionar placa (opcional)"}
              </Text>
              <Ionicons name="chevron-down" size={16} color="#3A3A3A" />
            </Pressable>
          </View>

        </SectionCard>

        {/* ══ SECTION 2: Detalle del servicio ══ */}
        <SectionCard number={2} title="Detalle del servicio">
          <TextAreaField label="Descripción del trabajo realizado" required value={trabajo} onChange={setTrabajo} placeholder="Describe el trabajo realizado…" />
          <TextAreaField label="Equipos instalados / intervenidos" value={equipos} onChange={setEquipos} placeholder="Lista de equipos (opcional)…" />
          <TextAreaField label="Materiales y repuestos utilizados" value={materiales} onChange={setMateriales} placeholder="Una línea por ítem, ej: 2x Cable UTP cat6…" />
          <TextAreaField label="Observaciones" value={observaciones} onChange={setObservaciones} placeholder="Observaciones adicionales (opcional)…" />
        </SectionCard>

        {/* ══ SECTION 3: Personal en sitio ══ */}
        <SectionCard number={3} title="Personal en sitio">

          {/* Técnico principal */}
          <View style={s.fieldWrap}>
            <Text style={s.subsectionLabel}>Técnico principal</Text>
            <View style={s.principalCard}>
              <View style={s.principalRow}>
                <View style={s.principalIcon}><Ionicons name="person" size={16} color="#FFFFFF" /></View>
                <Text style={s.principalName}>{tecnico?.nombre ?? "—"}</Text>
                <View style={s.principalBadge}><Text style={s.principalBadgeText}>Principal</Text></View>
              </View>
              <View style={{ gap: 12 }}>
                <View style={s.timeBlock}>
                  <Text style={s.techTimeLabel}>Entrada <Text style={s.required}>*</Text></Text>
                  <TimePicker value={horaEntrada} onChange={setHoraEntrada} />
                </View>
                <View style={s.timeBlock}>
                  <Text style={s.techTimeLabel}>Salida <Text style={s.required}>*</Text></Text>
                  <TimePicker value={horaSalida} onChange={setHoraSalida} />
                </View>
                {principalHours !== null && (
                  <View style={s.hoursChip}><Text style={s.hoursChipText}>{principalHours}h totales</Text></View>
                )}
              </View>
            </View>
          </View>

          {/* Técnicos auxiliares */}
          <View style={s.fieldWrap}>
            <Text style={s.subsectionLabel}>Técnicos auxiliares TAS ({tecnicosAux.length})</Text>
            {tecnicosAux.map((t) => (
              <TecnicoCard
                key={t.uid}
                tech={t}
                onRemove={() => removeTecnicoAux(t.uid)}
                onChangeEntrada={(v) => updateTecnicoAux(t.uid, "horaEntrada", v)}
                onChangeSalida={(v) => updateTecnicoAux(t.uid, "horaSalida", v)}
              />
            ))}
            <Pressable
              style={s.addTechBtn}
              onPress={() => { if (!IS_WEB) Haptics.selectionAsync(); setTechModalVisible(true); }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#CC0000" />
              <Text style={s.addTechBtnText}>Agregar técnico TAS</Text>
            </Pressable>
          </View>

          {/* Resumen horas */}
          {totalHorasEquipo !== null && (
            <View style={s.horasSummary}>
              <Ionicons name="time-outline" size={14} color="#1D9E75" />
              <Text style={s.horasSummaryText}>Total horas equipo: <Text style={{ color: "#1D9E75", fontFamily: "Inter_700Bold" }}>{totalHorasEquipo} horas</Text></Text>
            </View>
          )}

          {/* Subcontrato */}
          <View style={s.fieldWrap}>
            <Text style={s.subsectionLabel}>Personal subcontratado</Text>
            <FieldLabel text="¿Hubo personal subcontratado?" />
            <YesNoChips value={haySubcontrato} onChange={setHaySubcontrato} />
            {haySubcontrato === true && (
              <View style={[s.inputRow, { marginTop: 10 }]}>
                <Ionicons name="people-outline" size={16} color="#3A3A3A" />
                <TextInput
                  style={s.inputFlex}
                  value={cantidadSubcontrato}
                  onChangeText={setCantidadSubcontrato}
                  placeholder="¿Cuántas personas?"
                  placeholderTextColor="#3A3A3A"
                  keyboardType="number-pad"
                />
              </View>
            )}
          </View>


          {/* Supervisor asignado */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Supervisor a cargo" required />
            {supervisores.length > 0 ? (
              <View>
                <Pressable
                  style={[s.principalCard, { paddingVertical: 12, borderColor: !supervisorId ? "#CC000040" : "#2A2A2A" }]}
                  onPress={() => setSupervisorDropdownOpen((v) => !v)}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                      <View style={[s.principalIcon, { backgroundColor: supervisorId ? "rgba(204,0,0,0.12)" : "#1D1D1D" }]}>
                        <Ionicons name="person-circle-outline" size={16} color={supervisorId ? "#CC0000" : "#777"} />
                      </View>
                      <Text style={supervisorNombre ? s.principalName : { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14 }}>
                        {supervisorNombre || "Seleccionar supervisor…"}
                      </Text>
                    </View>
                    <Ionicons name={supervisorDropdownOpen ? "chevron-up" : "chevron-down"} size={14} color="#555" />
                  </View>
                </Pressable>
                {supervisorDropdownOpen && (
                  <View style={{ marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A", overflow: "hidden", backgroundColor: "#161616" }}>
                    {supervisores.map((s2) => {
                      const rolLabel: Record<string, string> = { supervisor: "Supervisor", gerente_operaciones: "Gerente Operaciones", admin: "Admin" };
                      return (
                        <Pressable
                          key={s2.id}
                          style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1E1E1E", backgroundColor: supervisorId === s2.id ? "#CC000015" : "transparent" }}
                          onPress={() => { setSupervisorId(s2.id); setSupervisorNombre(s2.nombre); setSupervisorDropdownOpen(false); }}
                        >
                          <Text style={{ color: supervisorId === s2.id ? "#CC0000" : "#CCC", fontFamily: supervisorId === s2.id ? "Inter_700Bold" : "Inter_500Medium", fontSize: 14 }}>{s2.nombre}</Text>
                          <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 }}>{rolLabel[s2.rol] ?? s2.rol}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : (
              <View style={[s.principalCard, { paddingVertical: 12, opacity: 0.5 }]}>
                <Text style={{ color: "#555", fontFamily: "Inter_400Regular", fontSize: 13 }}>Cargando supervisores…</Text>
              </View>
            )}
          </View>
        </SectionCard>

        {/* ══ SECTION 4: Estado del servicio ══ */}
        <SectionCard number={4} title="Estado del servicio">
          <FieldLabel text="Estado" required />
          <View style={s.estadoChips}>
            {(["Terminado", "En proceso"] as const).map((opt) => {
              const sel = estadoServicio === opt;
              const color = opt === "Terminado" ? "#1D9E75" : "#F59E0B";
              return (
                <Pressable
                  key={opt}
                  style={[s.estadoChip, sel && { backgroundColor: color, borderColor: color }]}
                  onPress={() => { if (!IS_WEB) Haptics.selectionAsync(); setEstadoServicio(opt); }}
                >
                  <View style={[s.estadoDot, { backgroundColor: sel ? "#FFFFFF" : color }]} />
                  <Text style={[s.estadoChipText, sel && { color: "#FFFFFF" }]}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        {/* ══ SECTION 5: Cotización ══ */}
        <SectionCard number={5} title="Cotización">
          <FieldLabel text="¿Hay algo por cotizar?" />
          <YesNoChips value={hayCotizacion} onChange={setHayCotizacion} />
          {hayCotizacion === true && (
            <View style={{ marginTop: 14 }}>
              <TextAreaField
                label="Describe qué hay por cotizar"
                value={descripcionCotizacion}
                onChange={setDescripcionCotizacion}
                placeholder="Equipos, materiales, servicios adicionales…"
              />
            </View>
          )}
        </SectionCard>

        {/* ══ SECTION 6: Evidencia ══ */}
        <SectionCard number={6} title="Evidencia">

          {/* Fotos */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Fotos adjuntas" />
            <View style={s.photoGrid}>
              {fotos.map((uri, i) => (
                <PhotoThumb
                  key={i}
                  uri={uri}
                  onRemove={() => setFotos((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
              {fotos.length < 8 && (
                <Pressable
                  style={s.addPhotoBtn}
                  onPress={() => showPhotoOptions((uri) => { if (uri) setFotos((prev) => [...prev, uri]); })}
                >
                  <Ionicons name="camera" size={24} color="#CC0000" />
                  <Text style={s.addPhotoText}>Agregar foto</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* Firma */}
          <View style={s.fieldWrap}>
            <FieldLabel text="Firma del cliente" />
            {firma ? (
              <View style={s.firmaContainer}>
                <View style={s.firmaPreview}>
                  <Ionicons name="checkmark-circle" size={20} color="#1D9E75" />
                  <Text style={s.firmaOkText}>Firma capturada</Text>
                </View>
                <Pressable style={s.firmaReSign} onPress={() => setSignatureModalVisible(true)}>
                  <Text style={s.firmaReSignText}>Volver a firmar</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable style={s.firmaBtn} onPress={() => setSignatureModalVisible(true)}>
                <Ionicons name="create-outline" size={20} color="#9A9A9A" />
                <Text style={s.firmaBtnText}>Capturar firma del cliente</Text>
              </Pressable>
            )}
          </View>

        </SectionCard>

      </ScrollView>

      {/* ── Fixed submit button ── */}
      <View style={[s.submitBar, { paddingBottom: botPad + 8 }]}>
        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            !canSubmit && s.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#FFFFFF" />
              <Text style={s.submitBtnText}>
                {canSubmit ? "Enviar Reporte" : `Faltan ${requiredFields.length - completedCount} campos requeridos`}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <Footer />

      {/* Modals */}
      <PlacaModal
        visible={placaModalVisible}
        selected={placa}
        onSelect={setPlaca}
        onClose={() => setPlacaModalVisible(false)}
      />

      <TecnicoSearchModal
        visible={techModalVisible}
        onClose={() => setTechModalVisible(false)}
        onSelect={addTecnicoAux}
        excludeNombre={tecnico?.nombre ?? ""}
        alreadyAdded={tecnicosAux.map((t) => t.nombre)}
      />

      <SignatureModal
        visible={signatureModalVisible}
        onClose={() => setSignatureModalVisible(false)}
        onConfirm={(data) => { setFirma(data); setSignatureModalVisible(false); }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
  },
  backPill: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#CC0000",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 4,
  },
  backPillText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 12 },
  headerTitle: { color: "#F0F0F0", fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1, textAlign: "center" },

  progressWrap: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8,
    gap: 10, backgroundColor: "#0D0D0D", borderBottomWidth: 1, borderBottomColor: "#1A1A1A",
  },
  progressTrack: { flex: 1, height: 4, backgroundColor: "#1E1E1E", borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#CC0000", borderRadius: 2 },
  progressText: { color: "#4A4A4A", fontFamily: "Inter_500Medium", fontSize: 11, width: 90, textAlign: "right" },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },

  section: {
    backgroundColor: "#111111", borderRadius: 14, marginBottom: 16,
    borderWidth: 1, borderColor: "#1E1E1E", overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: "#161616", borderBottomWidth: 1, borderBottomColor: "#1E1E1E",
  },
  sectionNum: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: "#CC0000",
    alignItems: "center", justifyContent: "center",
  },
  sectionNumText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  sectionTitle: { color: "#F0F0F0", fontFamily: "Inter_600SemiBold", fontSize: 15 },

  fieldWrap: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#1E1E1E" },
  label: { color: "#9A9A9A", fontFamily: "Inter_500Medium", fontSize: 12, letterSpacing: 0.3, marginBottom: 8, textTransform: "uppercase" },
  required: { color: "#CC0000" },
  fieldHint: { color: "#3A3A3A", fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 8, marginTop: -4 },

  inputRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A1A",
    borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
    paddingHorizontal: 12, gap: 8,
  },
  inputRowSelected: { borderColor: "#CC0000", backgroundColor: "#1A0A0A" },
  inputFlex: {
    flex: 1, color: "#E0E0E0", fontFamily: "Inter_400Regular", fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },

  dropdown: {
    marginTop: 6,
    backgroundColor: "#1E1E1E",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333333",
    overflow: "hidden",
  },
  dropdownScroll: {
    maxHeight: 220,
  },
  dropdownRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#2A2A2A",
    backgroundColor: "#1E1E1E",
  },
  dropdownRowPressed: { backgroundColor: "#2C2C2C" },
  dropdownSubRow: { backgroundColor: "#181818", paddingVertical: 10 },
  dropdownText: { color: "#E0E0E0", fontFamily: "Inter_400Regular", fontSize: 14, flex: 1 },
  dropdownSubText: { color: "#9A9A9A", fontSize: 13 },

  addClientRow: {
    borderTopWidth: 1,
    borderTopColor: "#1D9E75",
    backgroundColor: "#0D1F17",
  },
  addClientText: {
    color: "#1D9E75",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    flex: 1,
  },
  clienteCreandoWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    paddingHorizontal: 4,
  },
  clienteCreandoText: {
    color: "#1D9E75",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  clienteNuevoMsg: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    backgroundColor: "#0A1A14",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1D9E75",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clienteNuevoMsgText: {
    color: "#1D9E75",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },

  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRow: { flexDirection: "row", gap: 10 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: "#2A2A2A", backgroundColor: "#1A1A1A",
  },
  chipSelected: { backgroundColor: "#CC0000", borderColor: "#CC0000" },
  chipText: { color: "#6A6A6A", fontFamily: "Inter_500Medium", fontSize: 13 },
  chipTextSelected: { color: "#FFFFFF" },

  timePicker: { gap: 5 },
  timePickerDisplay: {
    color: "#1D9E75", fontFamily: "Inter_700Bold", fontSize: 18, textAlign: "center", marginBottom: 2,
  },
  timePickerRow: { flexDirection: "row", gap: 4 },
  timePickerBtn: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: "#1C1C1C", borderRadius: 7, paddingVertical: 7,
    borderWidth: 1, borderColor: "#2A2A2A",
  },
  timePickerBtnHourActive: { backgroundColor: "#1D9E75", borderColor: "#1D9E75" },
  timePickerBtnHourTextActive: { color: "#FFFFFF" },
  timePickerBtnMinActive: { backgroundColor: "#2A7FE8", borderColor: "#2A7FE8" },
  timePickerBtnMinTextActive: { color: "#FFFFFF" },
  timePickerBtnAmpmActive: { backgroundColor: "#D97706", borderColor: "#D97706" },
  timePickerBtnAmpmTextActive: { color: "#FFFFFF" },
  timePickerBtnText: { color: "#555", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  textarea: {
    backgroundColor: "#1A1A1A", borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
    color: "#E0E0E0", fontFamily: "Inter_400Regular", fontSize: 14,
    padding: 12, minHeight: 90, textAlignVertical: "top",
  },

  subsectionLabel: {
    color: "#CC0000", fontFamily: "Inter_600SemiBold", fontSize: 11,
    letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 12,
  },

  principalCard: {
    backgroundColor: "#1A1A1A", borderRadius: 10, borderWidth: 1, borderColor: "#CC0000",
    borderLeftWidth: 3, padding: 12, gap: 12,
  },
  principalRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  principalIcon: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: "#CC0000",
    alignItems: "center", justifyContent: "center",
  },
  principalName: { flex: 1, color: "#F0F0F0", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  principalBadge: {
    backgroundColor: "rgba(204,0,0,0.15)", borderRadius: 6,
    borderWidth: 1, borderColor: "#CC0000", paddingHorizontal: 7, paddingVertical: 2,
  },
  principalBadgeText: { color: "#CC0000", fontFamily: "Inter_600SemiBold", fontSize: 10 },
  timesRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  timeBlock: { flex: 1, gap: 4 },
  timeSep: { alignItems: "center", paddingTop: 18 },
  hoursChip: {
    backgroundColor: "rgba(29,158,117,0.15)", borderRadius: 6,
    borderWidth: 1, borderColor: "#1D9E75", paddingHorizontal: 8, paddingVertical: 4, marginTop: 18,
  },
  hoursChipText: { color: "#1D9E75", fontFamily: "Inter_700Bold", fontSize: 12 },

  techCard: {
    backgroundColor: "#1A1A1A", borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
    padding: 12, marginBottom: 8, gap: 10,
  },
  techCardHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  techIcon: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(204,0,0,0.1)",
    alignItems: "center", justifyContent: "center",
  },
  techCardName: { flex: 1, color: "#E0E0E0", fontFamily: "Inter_500Medium", fontSize: 14 },
  techCardTimes: { flexDirection: "column", gap: 0 },
  techTimeBlock: { flex: 1, gap: 4 },
  techTimeLabel: { color: "#4A4A4A", fontFamily: "Inter_400Regular", fontSize: 11 },
  techTimeSep: { alignItems: "center", paddingTop: 14 },
  techTimeSepText: { color: "#3A3A3A", fontSize: 16 },
  techHours: {
    backgroundColor: "rgba(29,158,117,0.1)", borderRadius: 6, paddingHorizontal: 7,
    paddingVertical: 3, borderWidth: 1, borderColor: "#1D9E75", marginTop: 14,
  },
  techHoursText: { color: "#1D9E75", fontFamily: "Inter_700Bold", fontSize: 12 },

  addTechBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12,
    paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A",
    borderStyle: "dashed", backgroundColor: "#141414",
  },
  addTechBtnText: { color: "#CC0000", fontFamily: "Inter_500Medium", fontSize: 14 },

  horasSummary: {
    flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 16,
    marginBottom: 12, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: "rgba(29,158,117,0.08)", borderRadius: 8,
    borderWidth: 1, borderColor: "rgba(29,158,117,0.2)",
  },
  horasSummaryText: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 13 },

  estadoChips: { flexDirection: "row", gap: 12, marginTop: 4, paddingHorizontal: 16, paddingBottom: 16 },
  estadoChip: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 16, borderRadius: 12, borderWidth: 1.5, borderColor: "#2A2A2A",
    backgroundColor: "#1A1A1A",
  },
  estadoDot: { width: 10, height: 10, borderRadius: 5 },
  estadoChipText: { color: "#6A6A6A", fontFamily: "Inter_600SemiBold", fontSize: 14 },

  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photoThumbOuter: { width: 84, height: 84 },
  photoThumb: { width: 84, height: 84, borderRadius: 10, overflow: "hidden" },
  photoImg: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: -7, right: -7 },
  addPhotoBtn: {
    width: 84, height: 84, borderRadius: 10, backgroundColor: "#1A1A1A",
    borderWidth: 1, borderColor: "#2A2A2A", borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", gap: 4,
  },
  addPhotoText: { color: "#CC0000", fontFamily: "Inter_500Medium", fontSize: 11 },

  firmaContainer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  firmaPreview: { flexDirection: "row", alignItems: "center", gap: 8 },
  firmaOkText: { color: "#1D9E75", fontFamily: "Inter_500Medium", fontSize: 14 },
  firmaReSign: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#1A1A1A", borderWidth: 1, borderColor: "#2A2A2A" },
  firmaReSignText: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 13 },
  firmaBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 10, borderWidth: 1, borderColor: "#2A2A2A", borderStyle: "dashed", backgroundColor: "#141414",
  },
  firmaBtnText: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 14 },

  submitBar: {
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "#0A0A0A", borderTopWidth: 1, borderTopColor: "#1A1A1A",
  },
  submitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: "#CC0000", borderRadius: 28, paddingVertical: 16, gap: 10,
  },
  submitBtnDisabled: { backgroundColor: "#2A2A2A" },
  submitBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16, letterSpacing: 0.2 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  successTitle: { color: "#F0F0F0", fontFamily: "Inter_700Bold", fontSize: 26, textAlign: "center" },
  successSub: { color: "#6A6A6A", fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center", lineHeight: 22 },
  successBtnRed: {
    backgroundColor: "#CC0000", borderRadius: 24, paddingVertical: 14,
    paddingHorizontal: 32, marginTop: 8, width: "100%", alignItems: "center",
  },
  successBtnOutline: {
    borderRadius: 24, paddingVertical: 14, paddingHorizontal: 32,
    width: "100%", alignItems: "center", borderWidth: 1, borderColor: "#2A2A2A",
  },
  successBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  successBtnOutlineText: { color: "#9A9A9A", fontFamily: "Inter_500Medium", fontSize: 15 },
});
