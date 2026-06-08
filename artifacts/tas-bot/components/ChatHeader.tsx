import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from "react-native";

interface ChatHeaderProps {
  onGoHome?: () => void;
  onConsultarCliente?: () => void;
  onNewReport?: () => void;
}

const tasLogo = require("../assets/tas-logo-color.png") as number;

// Animated icon button with press scale feedback
function IconBtn({
  iconName,
  onPress,
  style,
  iconColor = "#FFFFFF",
  iconSize = 18,
}: {
  iconName: React.ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
  style?: object;
  iconColor?: string;
  iconSize?: number;
}) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.9, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.iconBtn, style, { transform: [{ scale }] }]}>
        <Ionicons name={iconName} size={iconSize} color={iconColor} />
      </Animated.View>
    </Pressable>
  );
}

export function ChatHeader({ onGoHome, onConsultarCliente, onNewReport }: ChatHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const handleMenuOption = (action: () => void) => {
    setMenuOpen(false);
    setTimeout(action, 120);
  };

  return (
    <View style={styles.row}>
      {/* ── Back pill (← Inicio) ──────────────────────────── */}
      <BackPill label="Inicio" onPress={onGoHome} />

      {/* ── TAS logo avatar ──────────────────────────────── */}
      <View style={styles.avatar}>
        <Image source={tasLogo} style={styles.avatarImg} resizeMode="contain" />
      </View>

      {/* ── Title / subtitle ─────────────────────────────── */}
      <View style={styles.titleCol}>
        <Text style={styles.title} numberOfLines={1}>TAS Bot</Text>
        <Text style={styles.subtitle} numberOfLines={1}>Asistente de reportes</Text>
      </View>

      {/* ── Buscar cliente ────────────────────────────────── */}
      {onConsultarCliente ? (
        <IconBtn
          iconName="search"
          onPress={onConsultarCliente}
          style={styles.redSquare}
          iconColor="#FFFFFF"
          iconSize={17}
        />
      ) : null}

      {/* ── Three dots menu ───────────────────────────────── */}
      <Pressable
        onPress={() => setMenuOpen(true)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Más opciones"
      >
        {({ pressed }) => (
          <View style={[styles.iconBtn, styles.dotsBtn, pressed && styles.dotsBtnPressed]}>
            <Ionicons name="ellipsis-vertical" size={18} color="#FFFFFF" />
          </View>
        )}
      </Pressable>

      {/* ── Dropdown modal ────────────────────────────────── */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
        statusBarTranslucent={Platform.OS === "android"}
      >
        <TouchableWithoutFeedback onPress={() => setMenuOpen(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.dropdownCard}>
                {/* Nuevo Reporte */}
                {onNewReport && (
                  <Pressable
                    style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
                    onPress={() => handleMenuOption(onNewReport)}
                  >
                    <Ionicons name="add-circle-outline" size={16} color="#CC0000" />
                    <Text style={styles.dropdownItemText}>Nuevo Reporte</Text>
                  </Pressable>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

// ── Reusable red pill back button ──────────────────────────────────────────────

export function BackPill({ label, onPress }: { label: string; onPress?: () => void }) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={6}
      accessibilityRole="button"
    >
      <Animated.View style={[styles.backPill, { transform: [{ scale }] }]}>
        <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
        <Text style={styles.backText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  row: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 8,
  },

  // Red pill back button
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#CC0000",
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    gap: 4,
    minHeight: 36,
  },
  backText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.1,
  },

  // TAS logo avatar
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0A0A0A",
    borderWidth: 1,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginLeft: 2,
  },
  avatarImg: {
    width: 28,
    height: 13,
  },

  // Title
  titleCol: {
    flex: 1,
    marginLeft: 4,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    letterSpacing: 0.1,
  },
  subtitle: {
    color: "#9A9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },

  // Generic square icon button (dark)
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A2A2A",
    borderWidth: 1,
    borderColor: "#3A3A3A",
  },

  // Red square for consultar cliente
  redSquare: {
    backgroundColor: "#CC0000",
    borderColor: "#CC0000",
  },

  // Three dots button states
  dotsBtn: {},
  dotsBtnPressed: {
    backgroundColor: "#3A3A3A",
  },

  // Modal overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },

  // Dropdown card — positioned top-right under the header
  dropdownCard: {
    position: "absolute",
    top: 68,
    right: 12,
    minWidth: 180,
    backgroundColor: "#1C1C1C",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CC0000",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dropdownItemPressed: {
    backgroundColor: "rgba(204,0,0,0.12)",
  },
  dropdownItemText: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
});
