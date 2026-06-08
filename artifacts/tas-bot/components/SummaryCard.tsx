import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Path } from "react-native-svg";

import {
  FIELD_LABELS,
  FIELD_ORDER,
  REQUIRED_FIELDS,
  type ReportData,
  type ReportField,
} from "@/lib/conversation";
import type { SignatureData } from "@/lib/signature";

interface SummaryCardProps {
  data: ReportData;
  onEdit: () => void;
  onConfirm: () => void;
  onSignature: () => void;
  signature?: SignatureData | null;
}

export function SummaryCard({ data, onEdit, onConfirm, onSignature, signature }: SummaryCardProps) {
  const [showWarning, setShowWarning] = useState(false);

  const fields = FIELD_ORDER;
  const requiredSet = new Set<ReportField>(REQUIRED_FIELDS);
  const filled = fields.filter((f) => data[f] && data[f]!.trim().length > 0);
  const missingRequired = REQUIRED_FIELDS.filter(
    (f) => !data[f] || data[f]!.trim().length === 0,
  );

  const canConfirm = missingRequired.length === 0;

  const handleConfirmPress = () => {
    if (!canConfirm) return;
    if (!signature) {
      setShowWarning(true);
      return;
    }
    setShowWarning(false);
    onConfirm();
  };

  const handleSkip = () => {
    setShowWarning(false);
    onConfirm();
  };

  return (
    <View style={styles.outer}>
      <View style={styles.card}>
        <View style={styles.accentBar} />

        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="document-text" size={18} color="#CC0000" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Reporte de Servicio</Text>
              <Text style={styles.subtitle}>
                #{Math.floor(Date.now() / 1000) % 100000}
              </Text>
            </View>
          </View>

          <View style={styles.body}>
            {filled.length === 0 ? (
              <Text style={styles.empty}>Aún no hay datos.</Text>
            ) : (
              filled.map((key) => {
                const value = data[key]!;
                const isRequired = requiredSet.has(key);
                return (
                  <View key={key} style={styles.field}>
                    <View style={styles.labelRow}>
                      <Text style={styles.fieldLabel}>{FIELD_LABELS[key]}</Text>
                      {isRequired ? <View style={styles.requiredDot} /> : null}
                    </View>
                    <Text style={styles.fieldValue}>{value}</Text>
                  </View>
                );
              })
            )}

            {data.fotos && data.fotos.length > 0 ? (
              <View style={styles.photosBlock}>
                <View style={styles.photosHeader}>
                  <Ionicons name="images-outline" size={14} color="#9A9A9A" />
                  <Text style={styles.photosTitle}>
                    Fotos adjuntas ({data.fotos.length})
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.photosRow}
                >
                  {data.fotos.map((uri, i) => (
                    <Image
                      key={`${uri}-${i}`}
                      source={{ uri }}
                      style={styles.photoThumb}
                      contentFit="cover"
                      transition={120}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {missingRequired.length > 0 ? (
              <View style={styles.missingBlock}>
                <Text style={styles.missingTitle}>Faltan campos requeridos</Text>
                {missingRequired.map((f) => (
                  <Text key={f} style={styles.missingItem}>
                    • {FIELD_LABELS[f]}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>

          {/* ── Signature section ─────────────────────────────────────────── */}
          <View style={styles.signatureSection}>
            <View style={styles.signatureDivider} />
            {signature ? (
              <Pressable
                style={({ pressed }) => [
                  styles.signatureCaptured,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={onSignature}
              >
                <View style={styles.signatureThumbnailWrap}>
                  <Svg
                    width={110}
                    height={46}
                    viewBox={`0 0 ${signature.canvasWidth} ${signature.canvasHeight}`}
                    style={styles.signatureSvg}
                  >
                    {signature.paths.map((d, i) => (
                      <Path
                        key={i}
                        d={d}
                        stroke="#111111"
                        strokeWidth={4}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </Svg>
                </View>
                <View style={styles.signatureCapturedInfo}>
                  <View style={styles.signatureBadge}>
                    <Ionicons name="checkmark-circle" size={14} color="#1D9E75" />
                    <Text style={styles.signatureBadgeText}>Firma capturada ✓</Text>
                  </View>
                  <Text style={styles.signatureTapHint}>
                    Toca para ver o volver a capturar
                  </Text>
                </View>
              </Pressable>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.signatureBtn,
                  { opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => {
                  setShowWarning(false);
                  onSignature();
                }}
              >
                <Ionicons name="create-outline" size={16} color="#9A9A9A" />
                <Text style={styles.signatureBtnText}>Firma del cliente</Text>
              </Pressable>
            )}

            {showWarning && !signature ? (
              <View style={styles.warningBox}>
                <Ionicons name="alert-circle-outline" size={14} color="#F0A500" />
                <Text style={styles.warningText}>
                  Por favor capture la firma del cliente antes de confirmar
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <View style={styles.actions}>
            <Pressable
              onPress={onEdit}
              style={({ pressed }) => [
                styles.actionBtn,
                styles.secondaryBtn,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Ionicons name="create-outline" size={16} color="#9A9A9A" />
              <Text style={styles.secondaryBtnText}>Editar</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirmPress}
              disabled={!canConfirm}
              style={({ pressed }) => [
                styles.actionBtn,
                signature ? styles.primaryBtnGreen : styles.primaryBtn,
                {
                  opacity: !canConfirm ? 0.45 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {signature ? "Confirmar con firma" : "Confirmar"}
              </Text>
            </Pressable>
          </View>

          {showWarning && !signature ? (
            <Pressable onPress={handleSkip} style={styles.skipWrap}>
              <Text style={styles.skipText}>Continuar sin firma</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  card: {
    backgroundColor: "#1C1C1C",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    marginRight: 30,
    overflow: "hidden",
    flexDirection: "row",
  },
  accentBar: {
    width: 3,
    backgroundColor: "#CC0000",
  },
  inner: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#1A0000",
    borderWidth: 1,
    borderColor: "#3A0000",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  subtitle: {
    color: "#9A9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  body: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2A2A",
    paddingTop: 10,
  },
  empty: {
    color: "#9A9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingVertical: 6,
  },
  field: {
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  fieldLabel: {
    color: "#9A9A9A",
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  requiredDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#CC0000",
  },
  fieldValue: {
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  photosBlock: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2A2A",
  },
  photosHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  photosTitle: {
    color: "#9A9A9A",
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  photosRow: {
    gap: 6,
    paddingVertical: 2,
    paddingRight: 8,
  },
  photoThumb: {
    width: 64,
    height: 64,
    borderRadius: 6,
    backgroundColor: "#0A0A0A",
  },
  missingBlock: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#1A0000",
    borderWidth: 1,
    borderColor: "#440000",
  },
  missingTitle: {
    color: "#FF6B6B",
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 4,
  },
  missingItem: {
    color: "#FF9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  signatureSection: {
    marginTop: 8,
  },
  signatureDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2A2A2A",
    marginBottom: 10,
  },
  signatureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333333",
    borderStyle: "dashed",
    gap: 8,
    backgroundColor: "#181818",
  },
  signatureBtnText: {
    color: "#9A9A9A",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  signatureCaptured: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1F18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1D9E75",
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 10,
  },
  signatureThumbnailWrap: {
    width: 110,
    height: 46,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    overflow: "hidden",
  },
  signatureSvg: {
    flex: 1,
  },
  signatureCapturedInfo: {
    flex: 1,
    gap: 3,
  },
  signatureBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  signatureBadgeText: {
    color: "#1D9E75",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  signatureTapHint: {
    color: "#555555",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#1E1500",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3D2D00",
  },
  warningText: {
    flex: 1,
    color: "#F0A500",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2A2A2A",
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 24,
    gap: 6,
  },
  primaryBtn: {
    backgroundColor: "#CC0000",
  },
  primaryBtnGreen: {
    backgroundColor: "#1D9E75",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  secondaryBtn: {
    backgroundColor: "#2A2A2A",
  },
  secondaryBtnText: {
    color: "#9A9A9A",
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  skipWrap: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 2,
  },
  skipText: {
    color: "#555555",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
