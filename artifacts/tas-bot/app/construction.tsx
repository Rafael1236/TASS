import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Pulsing dot animation ──────────────────────────────────────────────────────

function PulsingRing() {
  const scale1 = useRef(new Animated.Value(1)).current;
  const opacity1 = useRef(new Animated.Value(0.7)).current;
  const scale2 = useRef(new Animated.Value(1)).current;
  const opacity2 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = (scaleVal: Animated.Value, opacityVal: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.parallel([
            Animated.timing(scaleVal, {
              toValue: 2.2,
              duration: 1600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(opacityVal, {
              toValue: 0,
              duration: 1600,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(scaleVal, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(opacityVal, { toValue: delay === 0 ? 0.7 : 0.5, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );

    const a1 = pulse(scale1, opacity1, 0);
    const a2 = pulse(scale2, opacity2, 800);
    a1.start();
    a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);

  return (
    <View style={ring.container}>
      <Animated.View style={[ring.ring, { transform: [{ scale: scale2 }], opacity: opacity2 }]} />
      <Animated.View style={[ring.ring, { transform: [{ scale: scale1 }], opacity: opacity1 }]} />
      <View style={ring.dot} />
    </View>
  );
}

const ring = StyleSheet.create({
  container: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 40,
  },
  ring: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1.5,
    borderColor: "#444444",
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function ConstructionScreen() {
  const { company } = useLocalSearchParams<{ company: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? Math.max(insets.top, 44) : insets.top + 8;

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(24)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const onPressIn = () =>
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true, speed: 80, bounciness: 0 }).start();
  const onPressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start();

  return (
    <View style={[styles.root, { paddingTop: topPad }]}>
      {/* Back button — red pill */}
      <Pressable
        onPress={() => router.replace("/")}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        hitSlop={8}
        accessibilityRole="button"
        style={styles.backWrap}
      >
        <Animated.View style={[styles.backBtn, { transform: [{ scale: btnScale }] }]}>
          <Ionicons name="arrow-back" size={13} color="#FFFFFF" />
          <Text style={styles.backText}>Volver</Text>
        </Animated.View>
      </Pressable>

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          { opacity: fadeIn, transform: [{ translateY: slideUp }] },
        ]}
      >
        <PulsingRing />

        <Text style={styles.emoji}>⚙️</Text>
        <Text style={styles.title}>IA en Construcción</Text>
        <Text style={styles.company}>
          {company ?? "Esta empresa"} — Próximamente
        </Text>
        <Text style={styles.subtitle}>
          Estamos construyendo algo increíble.
        </Text>

        <View style={styles.progressTrack}>
          <ProgressBar />
        </View>
      </Animated.View>
    </View>
  );
}

function ProgressBar() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, []);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return <Animated.View style={[styles.progressFill, { width }]} />;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111111",
    paddingHorizontal: 32,
  },
  backWrap: {
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#CC0000",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 4,
    minHeight: 36,
  },
  backText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    letterSpacing: 0.1,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 60,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 24,
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
    textAlign: "center",
    marginBottom: 12,
  },
  company: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: "#555555",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: "#444444",
    textAlign: "center",
    marginBottom: 48,
    lineHeight: 22,
  },
  progressTrack: {
    width: 180,
    height: 2,
    backgroundColor: "#222222",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 2,
    backgroundColor: "#CC0000",
    borderRadius: 2,
  },
});
