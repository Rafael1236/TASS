import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { SignatureData } from "@/lib/signature";

interface SignatureModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (data: SignatureData) => void;
}

export function SignatureModal({ visible, onClose, onConfirm }: SignatureModalProps) {
  const insets = useSafeAreaInsets();
  const [strokes, setStrokes] = useState<string[]>([]);
  const [activeStroke, setActiveStroke] = useState("");
  const [canvasSize, setCanvasSize] = useState({ width: 320, height: 300 });
  const currentStrokeRef = useRef("");

  const hasStrokes = strokes.length > 0 || activeStroke.length > 0;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const path = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        currentStrokeRef.current = path;
        setActiveStroke(path);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const next = `${currentStrokeRef.current} L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        currentStrokeRef.current = next;
        setActiveStroke(next);
      },
      onPanResponderRelease: () => {
        if (currentStrokeRef.current) {
          const completed = currentStrokeRef.current;
          setStrokes((prev) => [...prev, completed]);
          currentStrokeRef.current = "";
          setActiveStroke("");
        }
      },
    })
  ).current;

  const handleClear = useCallback(() => {
    setStrokes([]);
    setActiveStroke("");
    currentStrokeRef.current = "";
  }, []);

  const handleConfirm = useCallback(() => {
    const allStrokes = [...strokes, ...(activeStroke ? [activeStroke] : [])];
    if (allStrokes.length === 0) return;

    const { width, height } = canvasSize;
    const pathsXml = allStrokes
      .map(
        (d) =>
          `<path d="${d}" stroke="black" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join("");
    const svgXml = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:white">${pathsXml}</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${btoa(svgXml)}`;

    onConfirm({
      paths: allStrokes,
      canvasWidth: width,
      canvasHeight: height,
      dataUrl,
    });
  }, [strokes, activeStroke, canvasSize, onConfirm]);

  const handleClose = useCallback(() => {
    handleClear();
    onClose();
  }, [handleClear, onClose]);

  const topPad = Platform.OS === "web" ? Math.max(insets.top, 44) : insets.top + 8;
  const bottomPad = Math.max(insets.bottom, 24);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <View style={[styles.root, { paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
            onPress={handleClose}
          >
            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
            <Text style={styles.backText}>Volver</Text>
          </Pressable>
          <Text style={styles.title}>Firma del cliente</Text>
          <View style={styles.headerRight} />
        </View>

        <Text style={styles.instruction}>Pida al cliente que firme aquí</Text>

        <View
          style={styles.canvasWrap}
          onLayout={(e) =>
            setCanvasSize({
              width: e.nativeEvent.layout.width,
              height: e.nativeEvent.layout.height,
            })
          }
          {...panResponder.panHandlers}
        >
          <Svg
            width={canvasSize.width}
            height={canvasSize.height}
            style={StyleSheet.absoluteFill}
          >
            {strokes.map((d, i) => (
              <Path
                key={i}
                d={d}
                stroke="#000000"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {activeStroke ? (
              <Path
                d={activeStroke}
                stroke="#000000"
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>

          {!hasStrokes && (
            <View style={styles.placeholder} pointerEvents="none">
              <Ionicons name="create-outline" size={32} color="#CCCCCC" />
              <Text style={styles.placeholderText}>Firme aquí</Text>
            </View>
          )}
        </View>

        <View style={[styles.actions, { paddingBottom: bottomPad }]}>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              styles.clearBtn,
              { opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleClear}
          >
            <Text style={styles.clearText}>Limpiar</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.btn,
              styles.confirmBtn,
              { opacity: hasStrokes ? (pressed ? 0.85 : 1) : 0.4 },
            ]}
            onPress={handleConfirm}
            disabled={!hasStrokes}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.confirmText}>Confirmar firma</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#111111",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#222222",
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: 90,
  },
  backText: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 15,
  },
  title: {
    flex: 1,
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    textAlign: "center",
  },
  headerRight: {
    width: 90,
  },
  instruction: {
    color: "#9A9A9A",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  canvasWrap: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#DDDDDD",
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: {
    alignItems: "center",
    gap: 8,
  },
  placeholderText: {
    color: "#CCCCCC",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  clearBtn: {
    backgroundColor: "#2A2A2A",
  },
  clearText: {
    color: "#9A9A9A",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  confirmBtn: {
    backgroundColor: "#1D9E75",
  },
  confirmText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
});
