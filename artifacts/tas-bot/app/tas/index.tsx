import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { ClientSearchModal } from "@/components/ClientSearchModal";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/context/AuthContext";
import { useChat } from "@/context/ChatContext";
import { useTheme } from "@/context/ThemeContext";

const logo = require("../../assets/tas-logo-color.png");
const watermarkAsset = require("../../assets/tas-logo-watermark.png");

// ── Watermark background ───────────────────────────────────────────────────────
function WatermarkBackground() {
  if (Platform.OS !== "web") {
    return (
      <ImageBackground
        source={watermarkAsset}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFillObject, { opacity: 0.04 }]}
      />
    );
  }
  const asset = watermarkAsset as unknown as { uri?: string } | string | number;
  const uri =
    typeof asset === "string"
      ? asset
      : typeof asset === "object" && asset !== null && "uri" in asset
        ? (asset as { uri: string }).uri
        : null;
  if (!uri) return null;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          backgroundImage: `url(${uri})`,
          backgroundRepeat: "repeat",
          backgroundSize: "72px auto",
          filter: "invert(1) brightness(2)",
          opacity: 0.07,
        } as object,
      ]}
    />
  );
}

// ── Animated red pill back button ─────────────────────────────────────────────
function RedPillBack({ label, onPress }: { label: string; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={8}>
      <Animated.View style={[styles.hubBack, { transform: [{ scale }] }]}>
        <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
        <Text style={styles.hubBackText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Logout button ─────────────────────────────────────────────────────────────
function LogoutButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const onPressIn = () => {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.92, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  };
  const onPressOut = () => {
    setPressed(false);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={8}>
      <Animated.View style={[styles.logoutBtn, pressed && styles.logoutBtnPressed, { transform: [{ scale }] }]}>
        <Ionicons name="log-out-outline" size={20} color={pressed ? "#FFFFFF" : "#CC0000"} />
      </Animated.View>
    </Pressable>
  );
}

// ── Card types ────────────────────────────────────────────────────────────────
interface HomeCard {
  id: string;
  emoji: string;
  label: string;
  subtitle: string;
  onPress: () => void;
}

// ── Screen ─────────────────────────────────────────────────────────────────────
export default function TasHomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tecnico, logout } = useAuth();
  const { resetConversation } = useChat();
  const { colors, isDark, toggleTheme } = useTheme();
  const [clientModalVisible, setClientModalVisible] = useState(false);

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("¿Cerrar sesión?")) { logout(); router.replace("/"); }
      return;
    }
    Alert.alert("Cerrar sesión", "¿Estás seguro que quieres cerrar sesión?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Sí, salir", style: "destructive", onPress: () => { logout(); router.replace("/"); } },
    ]);
  };

  const rol = tecnico?.rol ?? "tecnico";
  const firstName = tecnico?.firstName ?? "Técnico";

  // ── Card definitions by role ──────────────────────────────────────────────
  const allCards: HomeCard[] = [
    {
      id: "nueva-boleta",
      emoji: "📋",
      label: "Nueva Boleta de Servicio",
      subtitle: "Registrar visita técnica",
      onPress: () => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push("/tas/nueva-boleta" as never);
      },
    },
    {
      id: "consultar-cliente",
      emoji: "🔍",
      label: "Consultar Cliente",
      subtitle: "Historial de servicios anteriores",
      onPress: () => {
        if (Platform.OS !== "web") Haptics.selectionAsync();
        setClientModalVisible(true);
      },
    },
    {
      id: "subcontratos",
      emoji: "🏗️",
      label: "Módulo Subcontratos",
      subtitle: "Gestión de proyectos y avances",
      onPress: () => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push("/subcontratos" as never);
      },
    },
  ];

  const cards: HomeCard[] =
    rol === "admin"
      ? allCards
      : rol === "supervisor"
        ? allCards  // supervisor: boleta + consultar + subcontratos
        : rol === "subcontratista"
          ? [allCards[2]!] // only subcontratos
          : [allCards[0]!, allCards[1]!]; // tecnico: boleta + consultar

  const isWeb = Platform.OS === "web";
  const topPadding = isWeb ? Math.max(insets.top, 44) : insets.top;
  const bottomPadding = isWeb ? 34 : Math.max(insets.bottom, 24);

  return (
    <View style={[styles.root, { paddingTop: topPadding }]}>
      <WatermarkBackground />

      {/* ── Top bar ────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <RedPillBack label="Hub" onPress={() => router.replace("/")} />
        {tecnico ? (
          <View style={styles.userChip}>
            <View style={styles.avatarDot}>
              <Text style={styles.avatarInitial}>{firstName.charAt(0).toUpperCase()}</Text>
            </View>
            <Text style={styles.userChipText} numberOfLines={1}>{firstName}</Text>
            {rol !== "tecnico" && (
              <View style={styles.rolBadge}>
                <Text style={styles.rolText}>
                  {rol === "admin" ? "Admin" : rol === "supervisor" ? "Sup" : "Sub"}
                </Text>
              </View>
            )}
          </View>
        ) : null}
        <Pressable
          onPress={toggleTheme}
          style={{
            width: 36, height: 36, borderRadius: 8,
            alignItems: "center", justifyContent: "center",
            backgroundColor: isDark ? "#2A2A2A" : "#E8E8E8",
            borderWidth: 1, borderColor: isDark ? "#555555" : "#BBBBBB",
          }}
          hitSlop={8}
        >
          <Text style={{ fontSize: 18 }}>{isDark ? "🌙" : "☀️"}</Text>
        </Pressable>
        <LogoutButton onPress={handleLogout} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPadding + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.logoSection}>
          <Image source={logo} style={styles.logoImage} resizeMode="contain" />
          {tecnico ? (
            <Text style={styles.greeting}>Hola, {firstName} 👋</Text>
          ) : (
            <Text style={styles.tagline}>TAS El Salvador</Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.cardGrid}>
          {cards.map((card) => (
            <HomeCard key={card.id} card={card} />
          ))}
        </View>

        <View style={styles.footer}>
          <Text style={styles.versionText}>TAS Bot Técnico · v2.0</Text>
        </View>
      </ScrollView>

      <Footer />

      <ClientSearchModal
        visible={clientModalVisible}
        onClose={() => setClientModalVisible(false)}
      />
    </View>
  );
}

function HomeCard({ card }: { card: HomeCard }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.983 : 1 }] },
      ]}
      onPress={card.onPress}
      android_ripple={{ color: "rgba(204,0,0,0.07)", borderless: false }}
    >
      <View style={styles.cardIconWrap}>
        <Text style={styles.cardEmoji}>{card.emoji}</Text>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardLabel}>{card.label}</Text>
        <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
      </View>
      <Text style={styles.cardChevron}>›</Text>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A0A0A" },
  topBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  hubBack: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#CC0000",
    borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, gap: 4, minHeight: 36,
  },
  hubBackText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13, letterSpacing: 0.1 },
  userChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  avatarDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#CC0000", alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#FFFFFF", fontFamily: "Inter_700Bold", fontSize: 12 },
  userChipText: { color: "#CCCCCC", fontFamily: "Inter_500Medium", fontSize: 13 },
  rolBadge: {
    backgroundColor: "rgba(204,0,0,0.15)", borderRadius: 8, borderWidth: 1,
    borderColor: "#CC0000", paddingHorizontal: 6, paddingVertical: 2,
  },
  rolText: { color: "#CC0000", fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.5 },
  logoutBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: "#2A2A2A",
    borderWidth: 1, borderColor: "#CC0000", alignItems: "center", justifyContent: "center",
  },
  logoutBtnPressed: { backgroundColor: "#CC0000", borderColor: "#CC0000" },
  scroll: { flexGrow: 1, paddingHorizontal: 24 },
  logoSection: { alignItems: "center", paddingTop: 24, paddingBottom: 28 },
  logoImage: { width: 210, height: 94, marginBottom: 12 },
  greeting: { color: "#FFFFFF", fontSize: 18, fontFamily: "Inter_600SemiBold", letterSpacing: -0.2 },
  tagline: { color: "#3A3A3A", fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 4, textTransform: "uppercase" },
  divider: { height: 1, backgroundColor: "#181818", marginBottom: 32 },
  cardGrid: { gap: 12 },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#161616",
    borderRadius: 16, paddingVertical: 20, paddingHorizontal: 20,
    borderLeftWidth: 3, borderLeftColor: "#CC0000", gap: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  },
  cardIconWrap: { width: 52, height: 52, borderRadius: 14, backgroundColor: "rgba(204,0,0,0.09)", alignItems: "center", justifyContent: "center" },
  cardEmoji: { fontSize: 26 },
  cardText: { flex: 1 },
  cardLabel: { color: "#F0F0F0", fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 3 },
  cardSubtitle: { color: "#4A4A4A", fontSize: 13, fontFamily: "Inter_400Regular" },
  cardChevron: { color: "#555", fontSize: 26, fontFamily: "Inter_400Regular", lineHeight: 30 },
  footer: { alignItems: "center", paddingTop: 52, paddingBottom: 8 },
  versionText: { color: "#222", fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 1.5 },
});
