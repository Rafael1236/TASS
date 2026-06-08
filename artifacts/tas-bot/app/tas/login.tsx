import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";

const logo = require("../../assets/tas-logo-color.png");

// ── Back pill button ───────────────────────────────────────────────────────────

function BackPill({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} hitSlop={8} style={styles.backWrap}>
      <Animated.View style={[styles.backBtn, { transform: [{ scale }] }]}>
        <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
        <Text style={styles.backText}>Hub</Text>
      </Animated.View>
    </Pressable>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function TasLoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, devLogin } = useAuth();

  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // TODO: Remove before production launch — dev shortcut state
  const [devToastVisible, setDevToastVisible] = useState(false);
  const devToastOpacity = useRef(new Animated.Value(0)).current;
  const devTapCount = useRef(0);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top + 8;
  const botPad = Math.max(insets.bottom, 28);

  // ── Normal login ─────────────────────────────────────────────────────────────

  const handleLogin = async () => {
    if (!usuario.trim() || !password.trim()) {
      setError("Por favor ingresa tu usuario y contraseña.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await login(usuario, password);
    setLoading(false);
    if (result.success) {
      // Subcontratistas go directly to their projects list
      if (result.tipo === "subcontratista") {
        router.replace("/subcontratos" as never);
      } else {
        router.replace("/tas");
      }
    } else if (result.web_only) {
      // Gerentes must use the web dashboard
      setError("Este usuario accede desde el dashboard web: tas-seguridad.com/dashboard");
    } else {
      setError(result.message ?? "Usuario o contraseña incorrectos");
    }
  };

  // ── Dev shortcut: 5 taps on logo within 3 seconds ────────────────────────────
  // TODO: Remove before production launch

  const showDevToast = useCallback(() => {
    setDevToastVisible(true);
    Animated.sequence([
      Animated.timing(devToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(devToastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setDevToastVisible(false));
  }, [devToastOpacity]);

  const handleLogoTap = useCallback(() => {
    // TODO: Remove before production launch
    devTapCount.current += 1;

    // Reset tap counter after 3 seconds of inactivity
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => {
      devTapCount.current = 0;
    }, 3000);

    if (devTapCount.current >= 5) {
      devTapCount.current = 0;
      if (devTapTimer.current) clearTimeout(devTapTimer.current);

      // Bypass auth — inject session directly
      // TODO: Remove before production launch
      devLogin({
        id: "dev-hernan-pinaud",
        nombre: "Hernan Pinaud",
        usuario: "hernan.pinaud",
        departamento: "ADMON. PROYECTOS",
        firstName: "Hernan",
        rol: "admin",
      });

      showDevToast();
      setTimeout(() => router.replace("/tas"), 800);
    }
  }, [devLogin, router, showDevToast]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (devTapTimer.current) clearTimeout(devTapTimer.current);
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0A0A0A" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: topPad + 24, paddingBottom: botPad + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Back to hub — red pill */}
        <BackPill onPress={() => router.replace("/")} />

        {/* Logo — tappable for dev shortcut (no visual feedback) */}
        <Pressable
          onPress={handleLogoTap}
          style={styles.logoWrap}
          accessibilityRole="image"
          accessibilityLabel="TAS Logo"
        >
          <View style={styles.logoRing}>
            <Image source={logo} style={styles.logo} resizeMode="contain" />
          </View>
        </Pressable>

        {/* Title */}
        <Text style={styles.title}>Bienvenido a TAS</Text>
        <Text style={styles.subtitle}>Ingresa tus credenciales</Text>

        {/* Form */}
        <View style={styles.form}>
          {/* Usuario */}
          <View style={styles.fieldWrap}>
            <View style={[styles.inputRow, error && styles.inputError]}>
              <Ionicons name="person-outline" size={18} color="#555555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={usuario}
                onChangeText={(t) => { setUsuario(t); setError(null); }}
                placeholder="Usuario (nombre.apellido)"
                placeholderTextColor="#444444"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Contraseña */}
          <View style={styles.fieldWrap}>
            <View style={[styles.inputRow, error && styles.inputError]}>
              <Ionicons name="lock-closed-outline" size={18} color="#555555" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(t) => { setPassword(t); setError(null); }}
                placeholder="Contraseña"
                placeholderTextColor="#444444"
                secureTextEntry={!showPass}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn}>
                <Ionicons
                  name={showPass ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color="#555555"
                />
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={15} color="#FF6B6B" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Login button */}
          <Pressable
            style={({ pressed }) => [
              styles.loginBtn,
              { opacity: loading ? 0.7 : pressed ? 0.85 : 1 },
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginBtnText}>Iniciar sesión</Text>
            )}
          </Pressable>

          {/* Forgot password */}
          <Text style={styles.forgotText}>
            ¿Olvidaste tu contraseña? Contacta a tu supervisor
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLabel}>TAS Bot Técnico · v2.0</Text>
        </View>
      </ScrollView>

      {/* Dev toast — TODO: Remove before production launch */}
      {devToastVisible && (
        <Animated.View
          style={[styles.devToast, { opacity: devToastOpacity }]}
          pointerEvents="none"
        >
          <Text style={styles.devToastText}>🛠️ Modo desarrollador</Text>
        </Animated.View>
      )}
    </KeyboardAvoidingView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    alignItems: "stretch",
  },
  backWrap: {
    alignSelf: "flex-start",
    marginBottom: 32,
  },
  backBtn: {
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
  logoWrap: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoRing: {
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: "#1A0000",
    borderWidth: 1,
    borderColor: "#330000",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 84,
    height: 38,
  },
  title: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    textAlign: "center",
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  subtitle: {
    color: "#5A5A5A",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 36,
  },
  form: {
    gap: 14,
  },
  fieldWrap: {
    gap: 4,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 4,
  },
  inputError: {
    borderColor: "#CC0000",
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    paddingVertical: Platform.OS === "android" ? 10 : 0,
  },
  eyeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#1A0000",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#440000",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: {
    flex: 1,
    color: "#FF6B6B",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  loginBtn: {
    backgroundColor: "#CC0000",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  loginBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    letterSpacing: 0.2,
  },
  forgotText: {
    color: "#3A3A3A",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
  footer: {
    alignItems: "center",
    marginTop: 60,
    gap: 10,
  },
  footerLabel: {
    color: "#2A2A2A",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.3,
  },

  // Dev toast — TODO: Remove before production launch
  devToast: {
    position: "absolute",
    bottom: 52,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  devToastText: {
    color: "#3A3A3A",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.3,
  },
});
