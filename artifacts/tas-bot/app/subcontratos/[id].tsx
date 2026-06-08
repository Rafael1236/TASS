import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
}

interface Actividad {
  id: string;
  nombre: string;
  porcentaje_avance: number;
  orden: number;
}

interface Foto {
  id: string;
  url: string;
  tipo: string;
}

interface Reporte {
  id: string;
  fecha: string;
  descripcion: string | null;
  tecnicos_presentes: Array<{ nombre: string }>;
  porcentaje_avance: number;
  estado: string;
  actividad_nombre: string | null;
  subcontratos_fotos: Foto[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getBarColor(pct: number): string {
  if (pct > 100) return "#8B0000";
  if (pct >= 90) return "#CC0000";
  if (pct >= 70) return "#F59E0B";
  return "#1D9E75";
}

function estadoBadge(estado: string): { label: string; color: string; icon: string } {
  if (estado === "aprobado")
    return { label: "Aprobado", color: "#1D9E75", icon: "checkmark-circle" };
  if (estado === "rechazado")
    return { label: "Rechazado", color: "#CC0000", icon: "close-circle" };
  return { label: "Pendiente", color: "#F59E0B", icon: "time" };
}

function formatFecha(f: string): string {
  try {
    return new Date(f).toLocaleDateString("es-SV", {
      day: "2-digit", month: "long", year: "numeric",
    });
  } catch {
    return f;
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActividadRow({ actividad }: { actividad: Actividad }) {
  const pct = actividad.porcentaje_avance;
  const color = getBarColor(pct);
  return (
    <View style={styles.actividadRow}>
      <View style={styles.actividadInfo}>
        <Text style={styles.actividadNombre} numberOfLines={2}>{actividad.nombre}</Text>
        <Text style={[styles.actividadPct, { color }]}>{pct}%</Text>
      </View>
      <View style={styles.actividadBar}>
        <View style={[styles.actividadBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function ReporteItem({ reporte }: { reporte: Reporte }) {
  const [expanded, setExpanded] = useState(false);
  const badge = estadoBadge(reporte.estado);
  const tecnicos = (reporte.tecnicos_presentes ?? []).map((t) => t.nombre).join(", ") || "—";

  return (
    <Pressable
      style={styles.reporteItem}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.reporteHeader}>
        <View style={styles.reporteHeaderLeft}>
          <Text style={styles.reporteFecha}>{formatFecha(reporte.fecha)}</Text>
          {reporte.actividad_nombre && (
            <Text style={styles.reporteActividad} numberOfLines={1}>{reporte.actividad_nombre}</Text>
          )}
        </View>
        <View style={styles.reporteBadgeRow}>
          <View style={[styles.reporteAvanceBadge, { borderColor: getBarColor(reporte.porcentaje_avance) }]}>
            <Text style={[styles.reporteAvanceText, { color: getBarColor(reporte.porcentaje_avance) }]}>
              {reporte.porcentaje_avance}%
            </Text>
          </View>
          <Ionicons name={badge.icon as never} size={18} color={badge.color} />
        </View>
      </View>

      {expanded && (
        <View style={styles.reporteBody}>
          <Text style={styles.reporteBodyLabel}>Estado</Text>
          <Text style={[styles.reporteBodyVal, { color: badge.color }]}>{badge.label}</Text>

          <Text style={styles.reporteBodyLabel}>Técnicos presentes</Text>
          <Text style={styles.reporteBodyVal}>{tecnicos}</Text>

          {reporte.descripcion ? (
            <>
              <Text style={styles.reporteBodyLabel}>Descripción</Text>
              <Text style={styles.reporteBodyVal}>{reporte.descripcion}</Text>
            </>
          ) : null}

          {(reporte.subcontratos_fotos ?? []).length > 0 && (
            <Text style={styles.reporteBodyLabel}>
              {reporte.subcontratos_fotos.length} foto(s) adjunta(s)
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ProyectoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/subcontratos/proyecto/${id}`);
      const json = (await res.json()) as {
        success: boolean;
        proyecto?: Proyecto;
        actividades?: Actividad[];
        reportes?: Reporte[];
        error?: string;
      };
      if (json.success) {
        setProyecto(json.proyecto ?? null);
        setActividades(json.actividades ?? []);
        setReportes(json.reportes ?? []);
      } else {
        setError(json.error ?? "Error al cargar proyecto");
      }
    } catch {
      setError("Sin conexión. Verifica tu red.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const onRefresh = () => { setRefreshing(true); fetchDetail(); };

  const topPad = Math.max(insets.top, 12);
  const botPad = Math.max(insets.bottom, 16);

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.simpleHeader}>
          <Pressable style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
            <Text style={styles.backPillText}>Proyectos</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <ActivityIndicator color="#CC0000" size="large" />
        </View>
      </View>
    );
  }

  if (error || !proyecto) {
    return (
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.simpleHeader}>
          <Pressable style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
            <Text style={styles.backPillText}>Proyectos</Text>
          </Pressable>
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? "Proyecto no encontrado"}</Text>
        </View>
      </View>
    );
  }

  const ec = proyecto.estado_calculado ?? "en_progreso";
  const pctDias = proyecto.porcentaje_dias ?? 0;
  const barColor = getBarColor(pctDias);

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backPill} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
          <Text style={styles.backPillText}>Proyectos</Text>
        </Pressable>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>{proyecto.nombre}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{proyecto.cliente_nombre}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 100 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#CC0000" />}
      >
        {/* Days counter */}
        <View style={[styles.daysCard, ec === "vencido" && { borderColor: "#8B0000" }, ec === "en_riesgo" && { borderColor: "#B45309" }, ec === "por_iniciar" && { borderColor: "#1D4ED8" }]}>
          {ec === "por_iniciar" ? (
            <View style={styles.daysCardHeader}>
              <View>
                <Text style={[styles.daysCardLabel, { color: "#3B82F6" }]}>Proyecto por iniciar</Text>
                <Text style={[styles.daysCardValue, { color: "#3B82F6" }]}>
                  Inicia en {proyecto.dias_para_iniciar} días
                </Text>
                {proyecto.fecha_inicio && (
                  <Text style={[styles.daysCardRestantes, { color: "#3B82F6" }]}>
                    {new Date(proyecto.fecha_inicio).toLocaleDateString("es-SV", { weekday: "long", day: "numeric", month: "long" })}
                  </Text>
                )}
              </View>
              <View style={{ backgroundColor: "#1D4ED8", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 }}>Próximo</Text>
              </View>
            </View>
          ) : ec === "vencido" ? (
            <>
              <View style={styles.daysCardHeader}>
                <View>
                  <Text style={[styles.daysCardLabel, { color: "#CC0000" }]}>⚠️ Proyecto vencido</Text>
                  <Text style={[styles.daysCardValue, { color: "#CC0000" }]}>
                    +{proyecto.dias_vencido}
                    <Text style={styles.daysCardMax}> días vencido</Text>
                  </Text>
                  <Text style={[styles.daysCardRestantes, { color: "#CC0000" }]}>
                    {proyecto.dias_transcurridos} de {proyecto.dias_maximos} días utilizados
                  </Text>
                </View>
                <Text style={[styles.daysCardPct, { color: "#8B0000" }]}>{pctDias}%</Text>
              </View>
              <View style={styles.daysBarTrack}>
                <View style={[styles.daysBarFill, { width: "100%", backgroundColor: "#8B0000" }]} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.daysCardHeader}>
                <View>
                  <Text style={styles.daysCardLabel}>Días transcurridos</Text>
                  <Text style={styles.daysCardValue}>
                    {proyecto.dias_transcurridos}
                    <Text style={styles.daysCardMax}> de {proyecto.dias_maximos} días</Text>
                  </Text>
                  <Text style={[styles.daysCardRestantes, { color: ec === "en_riesgo" ? "#F59E0B" : "#9A9A9A" }]}>
                    {proyecto.dias_restantes} días restantes
                    {ec === "en_riesgo" && " — ⚠️ En riesgo"}
                  </Text>
                </View>
                <Text style={[styles.daysCardPct, { color: barColor }]}>{pctDias}%</Text>
              </View>
              <View style={styles.daysBarTrack}>
                <View style={[styles.daysBarFill, { width: `${Math.min(pctDias, 100)}%` as `${number}%`, backgroundColor: barColor }]} />
              </View>
            </>
          )}
        </View>

        {/* Actividades */}
        {actividades.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actividades asignadas</Text>
            {actividades.map((a) => (
              <ActividadRow key={a.id} actividad={a} />
            ))}
          </View>
        )}

        {/* Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Reportes diarios ({reportes.length})
          </Text>
          {reportes.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Text style={styles.emptyTimelineText}>No hay reportes aún</Text>
            </View>
          ) : (
            reportes.map((r) => <ReporteItem key={r.id} reporte={r} />)
          )}
        </View>
      </ScrollView>

      {/* CTA button */}
      <View style={[styles.ctaBar, { paddingBottom: botPad + 8 }]}>
        <Pressable
          style={({ pressed }) => [styles.ctaBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={() =>
            router.push({
              pathname: "/subcontratos/nuevo-reporte" as never,
              params: {
                proyecto_id: proyecto.id,
                proyecto_nombre: proyecto.nombre,
              },
            })
          }
        >
          <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
          <Text style={styles.ctaBtnText}>Nuevo Reporte Diario</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },

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
  headerTitle: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
  headerSub: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 1 },

  scroll: { padding: 16, gap: 16 },

  daysCard: {
    backgroundColor: "#161616", borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: "#2A2A2A",
  },
  daysCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  daysCardLabel: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 4 },
  daysCardValue: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 28 },
  daysCardMax: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14 },
  daysCardRestantes: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  daysCardPct: { fontFamily: "Inter_700Bold", fontSize: 24 },
  daysBarTrack: { height: 8, backgroundColor: "#2A2A2A", borderRadius: 4, overflow: "hidden" },
  daysBarFill: { height: 8, borderRadius: 4 },

  section: { gap: 10 },
  sectionTitle: {
    color: "#CC0000", fontFamily: "Inter_700Bold", fontSize: 11,
    letterSpacing: 1, textTransform: "uppercase", marginBottom: 4,
  },

  actividadRow: {
    backgroundColor: "#161616", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#2A2A2A", gap: 8,
  },
  actividadInfo: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  actividadNombre: { color: "#FFFFFF", fontFamily: "Inter_500Medium", fontSize: 14, flex: 1 },
  actividadPct: { fontFamily: "Inter_700Bold", fontSize: 14 },
  actividadBar: { height: 6, backgroundColor: "#2A2A2A", borderRadius: 3, overflow: "hidden" },
  actividadBarFill: { height: 6, borderRadius: 3 },

  reporteItem: {
    backgroundColor: "#161616", borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: "#2A2A2A",
  },
  reporteHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  reporteHeaderLeft: { flex: 1 },
  reporteFecha: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  reporteActividad: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  reporteBadgeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  reporteAvanceBadge: { borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 7, paddingVertical: 2 },
  reporteAvanceText: { fontFamily: "Inter_700Bold", fontSize: 12 },

  reporteBody: { marginTop: 12, gap: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#2A2A2A" },
  reporteBodyLabel: { color: "#9A9A9A", fontFamily: "Inter_400Regular", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  reporteBodyVal: { color: "#FFFFFF", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20 },

  emptyTimeline: { padding: 20, alignItems: "center" },
  emptyTimelineText: { color: "#555", fontFamily: "Inter_400Regular", fontSize: 14 },

  ctaBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#0A0A0A", borderTopWidth: 1, borderTopColor: "#1C1C1C",
    paddingHorizontal: 16, paddingTop: 12,
  },
  ctaBtn: {
    backgroundColor: "#CC0000", borderRadius: 14, paddingVertical: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  ctaBtnText: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 16 },
});
