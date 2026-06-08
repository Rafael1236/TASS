import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/apiBase";

const IS_WEB = (Platform.OS as string) === "web";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Actividad {
  id: string;
  nombre: string;
  porcentaje_avance: number;
  orden: number;
}

interface Tecnico {
  id: string;
  nombre: string;
}

// ── Photo helpers ──────────────────────────────────────────────────────────────

async function pickImage(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permiso requerido", "Se necesita acceso a la galería para adjuntar fotos.");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: "images",
    quality: 0.7,
    base64: true,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.base64) {
    const mime = asset.mimeType ?? "image/jpeg";
    return `data:${mime};base64,${asset.base64}`;
  }
  return null;
}

async function takePhoto(): Promise<string | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== "granted") {
    Alert.alert("Permiso requerido", "Se necesita acceso a la cámara para tomar fotos.");
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7, base64: true });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  if (asset.base64) {
    const mime = asset.mimeType ?? "image/jpeg";
    return `data:${mime};base64,${asset.base64}`;
  }
  return null;
}

function showImagePickerOptions(onResult: (uri: string | null) => void) {
  if (Platform.OS === "web") { pickImage().then(onResult); return; }
  Alert.alert("Foto", "¿Cómo deseas agregar la foto?", [
    { text: "Cámara", onPress: () => takePhoto().then(onResult) },
    { text: "Galería", onPress: () => pickImage().then(onResult) },
    { text: "Cancelar", style: "cancel", onPress: () => onResult(null) },
  ]);
}

// ── Photo thumbnail ────────────────────────────────────────────────────────────

function PhotoThumb({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View style={styles.photoThumb}>
      <Image source={{ uri }} style={styles.photoThumbImg} />
      <Pressable style={styles.photoRemove} onPress={onRemove} hitSlop={4}>
        <Ionicons name="close-circle" size={20} color="#CC0000" />
      </Pressable>
    </View>
  );
}

// ── Percent control ────────────────────────────────────────────────────────────

function PercentControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 90 ? "#CC0000" : pct >= 70 ? "#F59E0B" : "#1D9E75";
  return (
    <View style={styles.pctContainer}>
      <Pressable
        style={({ pressed }) => [styles.pctBtn, { opacity: pressed ? 0.7 : 1 }]}
        onPress={() => onChange(Math.max(0, pct - 5))}
      >
        <Text style={styles.pctBtnText}>−5</Text>
      </Pressable>
      <View style={styles.pctDisplay}>
        <Text style={[styles.pctValue, { color }]}>{pct}%</Text>
        <View style={styles.pctBar}>
          <View style={[styles.pctBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
        </View>
      </View>
      <Pressable
        style={({ pressed }) => [styles.pctBtn, { opacity: pressed ? 0.7 : 1 }]}
        onPress={() => onChange(Math.min(100, pct + 5))}
      >
        <Text style={styles.pctBtnText}>+5</Text>
      </Pressable>
    </View>
  );
}

// ── Activity card (multi-select with GLOBAL % — value IS the total, not delta) ─

function ActivityCard({
  actividad,
  avanceTotal,
  onToggle,
  onChangeAvance,
}: {
  actividad: Actividad;
  avanceTotal: number | undefined;
  onToggle: () => void;
  onChangeAvance: (v: number) => void;
}) {
  const isSelected = avanceTotal !== undefined;
  const prev = actividad.porcentaje_avance;
  const isComplete = prev >= 100;
  const currentTotal = avanceTotal ?? prev;
  const isBelowPrev = isSelected && currentTotal < prev;
  const displayColor = isComplete
    ? "#1D9E75"
    : currentTotal >= 80
      ? "#F59E0B"
      : "#9A9A9A";
  const barPct = isSelected ? currentTotal : prev;

  return (
    <Pressable
      style={[styles.actCard, isSelected && styles.actCardSelected]}
      onPress={onToggle}
    >
      {/* Header row: checkbox + name + % badge */}
      <View style={styles.actCardRow}>
        <View style={[styles.actCheckbox, isSelected && styles.actCheckboxChecked]}>
          {isSelected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
        </View>
        <Text style={[styles.actCardName, isComplete && { color: "#555" }]} numberOfLines={2}>
          {actividad.nombre}
        </Text>
        <Text style={[styles.actCardPrevPct, { color: isComplete ? "#1D9E75" : displayColor }]}>
          {isComplete ? "✓ 100%" : `${isSelected ? currentTotal : prev}%`}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.actCardBar}>
        <View
          style={[
            styles.actCardBarFill,
            { width: `${Math.min(barPct, 100)}%` as `${number}%`, backgroundColor: isComplete ? "#1D9E75" : displayColor },
          ]}
        />
      </View>

      {/* Expanded: global % setter */}
      {isSelected && !isComplete && (
        <View style={styles.actExpanded}>
          <Text style={styles.actExpandedTitle}>¿En qué porcentaje está esta actividad actualmente?</Text>
          {prev > 0 && (
            <Text style={styles.actLastUpdate}>Última actualización: {prev}%</Text>
          )}
          <PercentControl value={currentTotal} onChange={onChangeAvance} />
          {isBelowPrev && (
            <Text style={styles.actOverWarn}>
              ⚠️ El avance no puede ser menor al registrado anteriormente ({prev}%)
            </Text>
          )}
        </View>
      )}

      {/* Already at 100% */}
      {isSelected && isComplete && (
        <View style={styles.actCompleteWarn}>
          <Ionicons name="warning-outline" size={14} color="#F59E0B" />
          <Text style={styles.actCompleteWarnText}>
            Esta actividad ya está al 100%. ¿Deseas marcarla como completada?
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function NuevoReporteScreen() {
  const { proyecto_id, proyecto_nombre } = useLocalSearchParams<{
    proyecto_id: string;
    proyecto_nombre: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tecnico } = useAuth();

  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [tecnicosRegistrados, setTecnicosRegistrados] = useState<Tecnico[]>([]);

  // Multi-activity avances: { [actividad_id]: avance_total_pct } — value IS the total, not a delta
  const [actividadAvances, setActividadAvances] = useState<Record<string, number>>({});
  const [tecnicosPresentes, setTecnicosPresentes] = useState<string[]>([]);
  const [fotosEvidencia, setFotosEvidencia] = useState<string[]>([]);
  const [descripcion, setDescripcion] = useState("");

  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!proyecto_id) return;
    const api = getApiBase();
    Promise.all([
      fetch(`${api}/subcontratos/proyecto/${proyecto_id}`)
        .then((r) => r.json() as Promise<{ success: boolean; actividades?: Actividad[] }>),
      fetch(`${api}/subcontratos/tecnicos?empresa_id=${encodeURIComponent(tecnico?.empresa_id ?? "")}&todos=false`)
        .then((r) => r.json() as Promise<{ success: boolean; tecnicos?: Tecnico[] }>),
    ])
      .then(([projRes, tecRes]) => {
        if (projRes.success)
          setActividades((projRes.actividades ?? []).sort((a, b) => a.orden - b.orden));
        if (tecRes.success) setTecnicosRegistrados(tecRes.tecnicos ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [proyecto_id]);

  const toggleActividad = (a: Actividad) => {
    setActividadAvances((prev) => {
      if (prev[a.id] !== undefined) {
        const next = { ...prev };
        delete next[a.id];
        return next;
      }
      // Initialize with current saved value so user sets the new TOTAL
      return { ...prev, [a.id]: a.porcentaje_avance };
    });
  };

  const setAvanceTotal = (actividadId: string, value: number) => {
    const act = actividades.find((a) => a.id === actividadId);
    const min = act?.porcentaje_avance ?? 0;
    // Allow setting below min so the warning shows, but cap at 100
    setActividadAvances((prev) => ({ ...prev, [actividadId]: Math.min(100, value) }));
  };

  const addTecnico = (nombre: string) => {
    const n = nombre.trim();
    if (!n || tecnicosPresentes.includes(n)) return;
    setTecnicosPresentes((prev) => [...prev, n]);
  };

  const removeTecnico = (nombre: string) =>
    setTecnicosPresentes((prev) => prev.filter((t) => t !== nombre));

  const handleSubmit = async () => {
    const selectedIds = Object.keys(actividadAvances);
    if (selectedIds.length === 0) {
      Alert.alert("Actividad requerida", "Selecciona al menos una actividad trabajada hoy.");
      return;
    }

    // Validate no activity is below its previous value
    const belowPrev = selectedIds.find((id) => {
      const act = actividades.find((a) => a.id === id);
      return act && actividadAvances[id] < act.porcentaje_avance;
    });
    if (belowPrev) {
      const act = actividades.find((a) => a.id === belowPrev)!;
      Alert.alert(
        "Avance inválido",
        `El avance de "${act.nombre}" no puede ser menor al registrado anteriormente (${act.porcentaje_avance}%).`,
      );
      return;
    }

    if (fotosEvidencia.length === 0) {
      Alert.alert("Fotos requeridas", "Debes adjuntar al menos una foto de evidencia.");
      return;
    }

    // Build payload: porcentaje_acumulado_nuevo IS the total (SET, not +=)
    const actividadesPayload = selectedIds.map((id) => {
      const act = actividades.find((a) => a.id === id)!;
      const totalNuevo = actividadAvances[id] ?? act.porcentaje_avance;
      return {
        actividad_id: id,
        actividad_nombre: act.nombre,
        porcentaje_avance_hoy: totalNuevo,
        porcentaje_acumulado_nuevo: totalNuevo,
      };
    });

    setSubmitting(true);
    try {
      const api = getApiBase();
      const res = await fetch(`${api}/subcontratos/reporte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proyecto_id,
          actividades: actividadesPayload,
          usuario_id: tecnico?.usuario ?? "",
          descripcion,
          tecnicos_presentes: tecnicosPresentes.map((n) => ({ nombre: n })),
          fotos_evidencia: fotosEvidencia,
        }),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (json.success) {
        setSuccess(true);
      } else {
        Alert.alert("Error", json.error ?? "No se pudo guardar el reporte. Intenta de nuevo.");
      }
    } catch {
      Alert.alert("Error de conexión", "Verifica tu red e intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  const topPad = Math.max(insets.top, 12);
  const botPad = Math.max(insets.bottom, 16);
  const selectedCount = Object.keys(actividadAvances).length;

  // ── Success ─────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={72} color="#1D9E75" />
          <Text style={styles.successTitle}>¡Reporte enviado!</Text>
          <Text style={styles.successSub}>
            El supervisor ha sido notificado. El avance de {selectedCount} actividad{selectedCount !== 1 ? "es" : ""} fue registrado.
          </Text>
          <Pressable style={styles.successBtn} onPress={() => router.back()}>
            <Text style={styles.successBtnText}>Volver al proyecto</Text>
          </Pressable>
        </View>
        <Footer />
      </View>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loadingData) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.simpleHeader}>
          <Pressable style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
            <Text style={styles.backPillText}>Detalle</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#CC0000" size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
          <Text style={styles.backPillText}>Detalle</Text>
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Nuevo Reporte Diario</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{proyecto_nombre}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Activities (multi-select) ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            1. Actividades trabajadas hoy{" "}
            <Text style={styles.required}>*</Text>
            {selectedCount > 0 && (
              <Text style={styles.sectionCount}>
                {" "}({selectedCount} seleccionada{selectedCount !== 1 ? "s" : ""})
              </Text>
            )}
          </Text>
          <Text style={styles.sectionHint}>
            Selecciona una o más actividades e indica el avance total actual de cada una
          </Text>
          <View style={styles.actividadList}>
            {actividades.map((a) => (
              <ActivityCard
                key={a.id}
                actividad={a}
                avanceTotal={actividadAvances[a.id]}
                onToggle={() => toggleActividad(a)}
                onChangeAvance={(v) => setAvanceTotal(a.id, v)}
              />
            ))}
            {actividades.length === 0 && (
              <Text style={styles.noActividades}>
                No hay actividades registradas para este proyecto
              </Text>
            )}
          </View>
        </View>

        {/* ── 2. Technicians ───────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            2. Técnicos presentes
            {tecnicosPresentes.length > 0 && (
              <Text style={styles.sectionCount}> ({tecnicosPresentes.length} seleccionado{tecnicosPresentes.length !== 1 ? "s" : ""})</Text>
            )}
          </Text>
          {tecnicosRegistrados.length === 0 ? (
            <View style={styles.noTecnicosBox}>
              <Ionicons name="information-circle-outline" size={18} color="#555" />
              <Text style={styles.noTecnicosText}>
                No hay técnicos registrados. Contactá al supervisor para agregar técnicos en el sistema.
              </Text>
            </View>
          ) : (
            <View style={styles.regTecnicos}>
              {tecnicosRegistrados.map((t) => {
                const selected = tecnicosPresentes.includes(t.nombre);
                return (
                  <Pressable
                    key={t.id}
                    style={[styles.regTecnico, selected && styles.regTecnicoAdded]}
                    onPress={() => (selected ? removeTecnico(t.nombre) : addTecnico(t.nombre))}
                  >
                    <Text style={[styles.regTecnicoText, selected && styles.regTecnicoTextAdded]}>
                      {t.nombre}
                    </Text>
                    <Ionicons
                      name={selected ? "checkmark-circle" : "add-circle-outline"}
                      size={14}
                      color={selected ? "#FFFFFF" : "#CC0000"}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* ── 3. Description ────────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Descripción del trabajo</Text>
          <TextInput
            style={styles.descInput}
            value={descripcion}
            onChangeText={setDescripcion}
            placeholder="Describe brevemente el trabajo realizado hoy…"
            placeholderTextColor="#555555"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── 4. Evidence photos (required) ─────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            4. Fotos de evidencia <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.sectionHint}>Mínimo 1 foto obligatoria</Text>
          <View style={styles.photoRow}>
            {fotosEvidencia.map((uri, i) => (
              <PhotoThumb
                key={i}
                uri={uri}
                onRemove={() => setFotosEvidencia((prev) => prev.filter((_, idx) => idx !== i))}
              />
            ))}
            {fotosEvidencia.length < 5 && (
              <Pressable
                style={[styles.photoAddSmall, fotosEvidencia.length === 0 && styles.photoAddSmallRequired]}
                onPress={() =>
                  showImagePickerOptions((uri) => {
                    if (uri) setFotosEvidencia((prev) => [...prev, uri]);
                  })
                }
              >
                <Ionicons name="camera-outline" size={24} color={fotosEvidencia.length === 0 ? "#CC0000" : "#555"} />
                {fotosEvidencia.length === 0 && (
                  <Text style={styles.photoAddRequiredText}>Agregar foto</Text>
                )}
              </Pressable>
            )}
          </View>
        </View>

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.submitBtn, { opacity: submitting || pressed ? 0.8 : 1 }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#FFFFFF" />
              <Text style={styles.submitBtnText}>Enviar reporte</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      <Footer />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },

  simpleHeader: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#1C1C1C" },
  header: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: "#1C1C1C",
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  backPill: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#CC0000",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 4,
  },
  backPillText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  headerTitles: { flex: 1 },
  headerTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  headerSub: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },

  scroll: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: {
    color: "#CC0000", fontFamily: "Inter_700Bold", fontSize: 11,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 6,
  },
  sectionHint: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 10 },
  sectionCount: { color: "#CC0000", fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "none" },
  required: { color: "#CC0000" },

  // Activity cards
  actividadList: { gap: 8 },
  actCard: {
    backgroundColor: "#161616", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#2A2A2A", gap: 8,
  },
  actCardSelected: { borderColor: "#CC0000", backgroundColor: "#180E0E" },
  actCardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  actCheckbox: {
    width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, borderColor: "#3A3A3A",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  actCheckboxChecked: { backgroundColor: "#CC0000", borderColor: "#CC0000" },
  actCardName: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  actCardPrevPct: { fontFamily: "Inter_700Bold", fontSize: 12, flexShrink: 0 },
  actCardBar: { height: 4, backgroundColor: "#2A2A2A", borderRadius: 2, overflow: "hidden" },
  actCardBarFill: { height: 4, borderRadius: 2 },

  actExpanded: {
    paddingTop: 12, borderTopWidth: 1, borderTopColor: "#2A2A2A", gap: 10,
  },
  actExpandedTitle: {
    color: "#9A9A9A", fontFamily: "Inter_600SemiBold", fontSize: 11,
    textTransform: "uppercase", letterSpacing: 0.5,
  },
  actLastUpdate: {
    color: "#555", fontFamily: "Inter_400Regular", fontSize: 12,
    marginTop: -4,
  },
  actOverWarn: { color: "#CC0000", fontFamily: "Inter_400Regular", fontSize: 11 },

  actCompleteWarn: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: "#2A2A2A",
  },
  actCompleteWarnText: {
    color: "#F59E0B", fontFamily: "Inter_400Regular", fontSize: 12, flex: 1, lineHeight: 18,
  },

  noActividades: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 13 },
  noTecnicosBox: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 8, backgroundColor: "#0A0A0A", borderWidth: 1, borderColor: "#2A2A2A", borderRadius: 10, padding: 12, marginTop: 4 },
  noTecnicosText: { flex: 1, color: "#666", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },

  // Technicians
  regTecnicos: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  regTecnico: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#1C1C1C", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: "#CC0000",
  },
  regTecnicoAdded: { backgroundColor: "#CC0000", borderColor: "#CC0000" },
  regTecnicoText: { color: "#CC0000", fontFamily: "Inter_500Medium", fontSize: 13 },
  regTecnicoTextAdded: { color: "#FFFFFF" },
  addTecnicoRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  addTecnicoInput: {
    flex: 1, backgroundColor: "#161616", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A2A",
    paddingHorizontal: 14, paddingVertical: 10, color: "#FFFFFF",
    fontFamily: "Inter_400Regular", fontSize: 14,
  },
  addTecnicoBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: "#CC0000",
    alignItems: "center", justifyContent: "center",
  },
  tecnicoTag: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#161616", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1, borderColor: "#2A2A2A", marginBottom: 6,
  },
  tecnicoTagText: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },

  // Photos
  photoAddBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#161616", borderRadius: 14, borderWidth: 1.5,
    borderColor: "#CC0000", borderStyle: "dashed", padding: 18,
  },
  photoAddBtnMuted: { borderColor: "#2A2A2A" },
  photoAddText: { color: "#CC0000", fontFamily: "Inter_500Medium", fontSize: 14 },
  photoAddTextMuted: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 13 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoThumb: { position: "relative", width: 80, height: 80 },
  photoThumbImg: { width: 80, height: 80, borderRadius: 10, backgroundColor: "#161616" },
  photoRemove: { position: "absolute", top: -6, right: -6, backgroundColor: "#0A0A0A", borderRadius: 10 },
  photoAddSmall: {
    width: 80, height: 80, borderRadius: 10, borderWidth: 1.5, borderColor: "#2A2A2A",
    borderStyle: "dashed", alignItems: "center", justifyContent: "center",
    backgroundColor: "#161616",
  },
  photoAddSmallRequired: {
    width: 120, height: 80, borderColor: "#CC0000",
    gap: 4,
  },
  photoAddRequiredText: {
    color: "#CC0000", fontFamily: "Inter_500Medium", fontSize: 11,
  },

  // Description
  descInput: {
    backgroundColor: "#161616", borderRadius: 12, borderWidth: 1, borderColor: "#2A2A2A",
    paddingHorizontal: 14, paddingVertical: 12, color: "#FFFFFF",
    fontFamily: "Inter_400Regular", fontSize: 14, minHeight: 100,
  },

  // Percent control
  pctContainer: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#161616", borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: "#2A2A2A",
  },
  pctBtn: {
    width: 44, height: 44, borderRadius: 10, backgroundColor: "#1E1E1E",
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#2A2A2A",
  },
  pctBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
  pctDisplay: { flex: 1, gap: 6, alignItems: "center" },
  pctValue: { fontFamily: "Inter_700Bold", fontSize: 26 },
  pctBar: { width: "100%", height: 6, backgroundColor: "#2A2A2A", borderRadius: 3, overflow: "hidden" },
  pctBarFill: { height: 6, borderRadius: 3 },

  // Submit
  submitBtn: {
    backgroundColor: "#CC0000", borderRadius: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginTop: 8,
  },
  submitBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },

  // Success
  successTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 22, textAlign: "center" },
  successSub: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  successBtn: {
    marginTop: 8, backgroundColor: "#CC0000", borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32,
  },
  successBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 15 },
});
