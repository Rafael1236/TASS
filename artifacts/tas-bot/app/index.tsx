import { useRouter } from "expo-router";
import React, { useRef } from "react";
import {
  Animated,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

// ── Assets ────────────────────────────────────────────────────────────────────

const hubLogo     = require("../assets/hub-logo.png");
const tasLogo     = require("../assets/tas-logo-color.png");
const altesaLogo  = require("../assets/logo-altesa.png");
const movuxLogo   = require("../assets/logo-movux.png");
const eticketLogo = require("../assets/logo-eticket.png");
const ittLogo     = require("../assets/logo-itt.png");

// ── Company definitions ────────────────────────────────────────────────────────

type IconContent =
  | { kind: "image"; asset: number; padding?: number }
  | { kind: "initials"; text: string };

interface Company {
  id: string;
  name: string;
  iconBg: string;
  content: IconContent;
  route: string;
  params?: Record<string, string>;
}

const COMPANIES: Company[] = [
  {
    id: "tas",
    name: "TAS",
    iconBg: "#CC0000",
    content: { kind: "image", asset: tasLogo, padding: 10 },
    route: "/tas/login",
  },
  {
    id: "altesa",
    name: "ALTESA",
    iconBg: "#F0F0F0",
    content: { kind: "image", asset: altesaLogo, padding: 4 },
    route: "/construction",
    params: { company: "ALTESA" },
  },
  {
    id: "movux",
    name: "MovuX",
    iconBg: "#FFFFFF",
    content: { kind: "image", asset: movuxLogo, padding: 12 },
    route: "/construction",
    params: { company: "MovuX" },
  },
  {
    id: "eticket",
    name: "eTicket",
    iconBg: "#465059",
    content: { kind: "image", asset: eticketLogo, padding: 0 },
    route: "/construction",
    params: { company: "eTicket" },
  },
  {
    id: "itt",
    name: "ITT",
    iconBg: "#FFFFFF",
    content: { kind: "image", asset: ittLogo, padding: 8 },
    route: "/construction",
    params: { company: "ITT" },
  },
];

// ── Icon component ────────────────────────────────────────────────────────────

function CompanyIcon({ company }: { company: Company }) {
  const router = useRouter();
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 60,
      bounciness: 2,
    }).start();

  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 28,
      bounciness: 8,
    }).start();

  const handlePress = () => {
    if (Platform.OS !== "web")
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: company.route as never, params: company.params });
  };

  const c = company.content;
  const pad = c.kind === "image" ? (c.padding ?? 8) : 0;

  return (
    <Pressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={handlePress}
      style={styles.iconWrapper}
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: "center" }}>
        <View style={[styles.iconSquare, { backgroundColor: company.iconBg }]}>
          {c.kind === "image" && (
            <Image
              source={c.asset}
              style={{ width: ICON_SIZE - pad * 2, height: ICON_SIZE - pad * 2 }}
              resizeMode="contain"
            />
          )}
          {c.kind === "initials" && (
            <Text style={styles.initials}>{c.text}</Text>
          )}
        </View>
        <Text style={styles.iconName} numberOfLines={1}>
          {company.name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HubScreen() {
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 44) : insets.top + 16;
  const bottomPad = isWeb ? 40 : Math.max(insets.bottom, 32);

  const rows: Company[][] = [];
  for (let i = 0; i < COMPANIES.length; i += 3)
    rows.push(COMPANIES.slice(i, i + 3));

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: topPad + 48 }]}>
          <Image
            source={hubLogo}
            style={styles.hubLogo}
            resizeMode="contain"
          />
          <Text style={styles.hubTitle}>Hub de IA</Text>
          <Text style={styles.hubSub}>Selecciona tu empresa</Text>
        </View>

        {/* ── Divider ── */}
        <View style={styles.divider} />

        {/* ── Grid ── */}
        <View style={styles.grid}>
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={[styles.gridRow, row.length < 3 && styles.gridRowCentered]}
            >
              {row.map((co) => (
                <CompanyIcon key={co.id} company={co} />
              ))}
            </View>
          ))}
        </View>

        {/* ── Quote ── */}
        <View style={styles.quoteWrap}>
          <Text style={styles.quote}>
            "La excelencia no es un acto,{"\n"}es una forma de trabajar."
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ICON_SIZE = 76;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F5F5F7",
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    alignItems: "center",
    paddingBottom: 32,
    gap: 14,
  },
  hubLogo: {
    width: 320,
    height: 45,   // 320 / 7.22 ≈ 45
  },
  hubTitle: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    color: "#111111",
    letterSpacing: -0.5,
    marginTop: 2,
  },
  hubSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#888888",
    letterSpacing: 0.1,
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E5E5",
    marginBottom: 32,
    marginHorizontal: -4,
  },
  grid: {
    gap: 28,
    alignItems: "center",
  },
  gridRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    paddingHorizontal: 8,
  },
  gridRowCentered: {
    justifyContent: "center",
    gap: 36,
  },
  iconWrapper: {
    alignItems: "center",
    width: ICON_SIZE + 16,
  },
  iconSquare: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    overflow: "hidden",
  },
  initials: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  iconName: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#111111",
    textAlign: "center",
    letterSpacing: -0.1,
  },
  quoteWrap: {
    alignItems: "center",
    paddingTop: 44,
    paddingBottom: 8,
  },
  quote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#BBBBBB",
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});
