import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/apiBase";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Proyecto {
  id: string;
  nombre: string;
  cliente_nombre: string;
  fecha_inicio: string | null;
  fecha_fin_estimada: string | null;
  dias_maximos: number;
  dias_utilizados: number;
  dias_transcurridos: number;
  dias_restantes: number;
  dias_para_iniciar: number;
  dias_vencido: number;
  porcentaje_dias: number;
  estado: string;
  estado_calculado: "por_iniciar" | "en_progreso" | "en_riesgo" | "vencido" | "completado";
  ultima_actividad: string | null;
}

interface Trabajador {
  id: string;
  nombre: string;
  activo: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBarColor(ec: Proyecto["estado_calculado"]): string {
  if (ec === "vencido") return "#8B0000";
  if (ec === "en_riesgo") return "#F59E0B";
  if (ec === "completado") return "#3A3A3A";
  return "#1D9E75";
}

// ── Pulsing dot ────────────────────────────────────────────────────────────────

function PulsingDot({ color = "#CC0000" }: { color?: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.25, duration: 600, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ).start();
  }, [anim]);
  return <Animated.View style={[styles.pulsingDot, { opacity: anim, backgroundColor: color }]} />;
}

// ── Project card ───────────────────────────────────────────────────────────────

function ProyectoCard({ proyecto, onPress }: { proyecto: Proyecto; onPress: () => void }) {
  const ec = proyecto.estado_calculado ?? "en_progreso";
  const pct = proyecto.porcentaje_dias ?? 0;
  const barColor = getBarColor(ec);

  const BADGE: Record<Proyecto["estado_calculado"], { label: string; bg: string }> = {
    por_iniciar: { label: `Inicia en ${proyecto.dias_para_iniciar}d`, bg: "#1D4ED8" },
    en_progreso: { label: "En progreso", bg: "#1D9E75" },
    en_riesgo:   { label: "En riesgo",   bg: "#B45309" },
    vencido:     { label: `Vencido +${proyecto.dias_vencido}d`, bg: "#8B0000" },
    completado:  { label: "Completado",  bg: "#3A3A3A" },
  };
  const badge = BADGE[ec];

  const shouldPulse = ec === "en_riesgo" || ec === "vencido";
  const cardOpacity = ec === "por_iniciar" || ec === "completado" ? 0.72 : 1;
  const borderColor = ec === "vencido" ? "#8B0000" : ec === "en_riesgo" ? "#B45309" : "#CC0000";

  const fechaInicioLabel = proyecto.fecha_inicio
    ? new Date(proyecto.fecha_inicio).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })
    : "—";

  const daysLabel =
    ec === "por_iniciar"
      ? `Inicio: ${fechaInicioLabel}`
      : ec === "vencido"
        ? `Vencido hace ${proyecto.dias_vencido} día(s) — ${proyecto.dias_transcurridos} de ${proyecto.dias_maximos} días`
        : `${proyecto.dias_transcurridos} de ${proyecto.dias_maximos} días — ${proyecto.dias_restantes} días restantes`;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.85 : cardOpacity, transform: [{ scale: pressed ? 0.985 : 1 }], borderLeftColor: borderColor },
      ]}
      onPress={onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          {shouldPulse && <PulsingDot color={borderColor} />}
          <Text style={styles.cardTitle} numberOfLines={1}>{proyecto.nombre}</Text>
        </View>
        <View style={[styles.estadoBadge, { backgroundColor: badge.bg }]}>
          <Text style={styles.estadoText}>{badge.label}</Text>
        </View>
      </View>

      <Text style={styles.cardCliente} numberOfLines={1}>Cliente: {proyecto.cliente_nombre}</Text>

      {ec === "por_iniciar" ? (
        <View style={styles.porIniciarBox}>
          <Text style={styles.porIniciarMsg}>🗓️ Prepara tu equipo, el proyecto comienza pronto.</Text>
        </View>
      ) : (
        <View style={styles.daysRow}>
          <View style={styles.daysBar}>
            <View style={[styles.daysBarFill, { width: `${Math.min(pct, 100)}%` as `${number}%`, backgroundColor: barColor }]} />
          </View>
          <Text style={[styles.daysPct, { color: barColor }]}>{pct}%</Text>
        </View>
      )}

      <Text style={[
        styles.daysLabel,
        ec === "por_iniciar" && { color: "#3B82F6" },
        ec === "vencido" && { color: "#CC0000" },
      ]}>{daysLabel}</Text>

      {proyecto.ultima_actividad && (
        <Text style={styles.lastActivity}>
          Última actividad: {new Date(proyecto.ultima_actividad).toLocaleDateString("es-SV", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
      )}

      <View style={styles.cardFooter}>
        <Text style={styles.verDetalle}>Ver detalle →</Text>
      </View>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function SubcontratosListScreen() {
  const { tecnico } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProyectos = useCallback(async () => {
    if (!tecnico) return;
    setError(null);
    try {
      const api = getApiBase();
      const params = new URLSearchParams({
        usuario_id: tecnico.usuario,
        rol: tecnico.rol,
      });
      if (tecnico.empresa_id) params.set("empresa_id", tecnico.empresa_id);
      const res = await fetch(`${api}/subcontratos/proyectos?${params.toString()}`);
      const json = (await res.json()) as { success: boolean; proyectos?: Proyecto[]; error?: string };
      if (json.success) {
        setProyectos(json.proyectos ?? []);
      } else {
        setError(json.error ?? "Error al cargar proyectos");
      }
    } catch {
      setError("Sin conexión. Verifica tu red.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tecnico]);

  useEffect(() => {
    fetchProyectos();
  }, [fetchProyectos]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProyectos();
  };

  const topPad = Math.max(insets.top, 12);

  const isSubcontratista = tecnico?.rol === "subcontratista";

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backPill, { opacity: pressed ? 0.8 : 1 }]}
          onPress={() => isSubcontratista ? router.replace("/tas/login" as never) : router.replace("/tas")}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
          <Text style={styles.backPillText}>{isSubcontratista ? "Salir" : "TAS"}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Mis Proyectos</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Personalized greeting for subcontratistas */}
      {isSubcontratista && tecnico && (
        <View style={styles.greetingBox}>
          <Text style={styles.greetingText}>
            Hola, {tecnico.firstName}. Aquí están tus proyectos.
          </Text>
        </View>
      )}

      {loading && !refreshing ? (
        <View style={styles.center}>
          <ActivityIndicator color="#CC0000" size="large" />
          <Text style={styles.loadingText}>Cargando proyectos…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="cloud-offline-outline" size={48} color="#3A3A3A" />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); fetchProyectos(); }}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : proyectos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏗️</Text>
          <Text style={styles.emptyTitle}>Sin proyectos asignados</Text>
          <Text style={styles.emptySubtitle}>Los proyectos aparecerán aquí cuando sean asignados</Text>
        </View>
      ) : (
        <FlatList
          data={proyectos}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#CC0000" />}
          renderItem={({ item }) => (
            <ProyectoCard
              proyecto={item}
              onPress={() => router.push({ pathname: "/subcontratos/[id]" as never, params: { id: item.id } })}
            />
          )}
        />
      )}

      <Footer />

    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C1C1C",
    gap: 12,
  },
  backPill: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#CC0000",
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 4,
  },
  backPillText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  headerTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 18, flex: 1 },
  headerSpacer: { width: 36 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  loadingText: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14, marginTop: 8 },
  errorText: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 22 },
  retryBtn: { marginTop: 8, backgroundColor: "#CC0000", borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  emptyEmoji: { fontSize: 48, marginBottom: 8 },
  emptyTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 17, textAlign: "center" },
  emptySubtitle: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center", lineHeight: 20 },

  list: { padding: 16, gap: 14, paddingBottom: 32 },

  card: {
    backgroundColor: "#161616", borderRadius: 16, padding: 16,
    borderLeftWidth: 3, borderLeftColor: "#CC0000",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 5,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 },
  cardTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  badgeRow: { flexDirection: "row", gap: 4, alignItems: "center" },
  pulsingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#CC0000" },
  cardTitle: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 15, flex: 1 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  estadoText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  cardCliente: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 13, marginBottom: 12 },

  daysRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  daysBar: {
    flex: 1, height: 7, backgroundColor: "#2A2A2A", borderRadius: 4, overflow: "hidden",
  },
  daysBarFill: { height: 7, borderRadius: 4 },
  daysPct: { fontFamily: "Inter_700Bold", fontSize: 13, minWidth: 36, textAlign: "right" },
  daysLabel: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 6 },
  lastActivity: { color: "#3A3A3A", fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  cardFooter: { marginTop: 10, alignItems: "flex-end" },
  verDetalle: { color: "#CC0000", fontFamily: "Inter_600SemiBold", fontSize: 13 },

  greetingBox: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1C1C1C",
  },
  greetingText: {
    color: "#9A9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },

  porIniciarBox: {
    backgroundColor: "#1D4ED8" + "18",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 4,
  },
  porIniciarMsg: {
    color: "#60A5FA",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },

});
