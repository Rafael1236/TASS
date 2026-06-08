import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  ImageBackground,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChatHeader } from "@/components/ChatHeader";
import { Footer } from "@/components/Footer";
import { ClientSearchModal } from "@/components/ClientSearchModal";
import { ChatInput } from "@/components/ChatInput";
import { ImageBubble, MessageBubble, VoiceBubble } from "@/components/MessageBubble";
import { QuickReply } from "@/components/QuickReply";
import { SignatureModal } from "@/components/SignatureModal";
import { SummaryCard } from "@/components/SummaryCard";
import { useColors } from "@/hooks/useColors";
import { useChat, type Message } from "@/context/ChatContext";
import type { SignatureData } from "@/lib/signature";

// ── Watermark background ──────────────────────────────────────────────────────

const logoAsset = require("../assets/tas-logo-watermark.png") as number;

function WatermarkBackground() {
  if (Platform.OS !== "web") {
    // Native: ImageBackground with resizeMode="repeat" tiles the logo
    return (
      <ImageBackground
        source={logoAsset}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFillObject, styles.watermarkNative]}
      />
    );
  }
  // Web: Metro bundles image requires as objects { uri, width, height }
  const asset = logoAsset as unknown as { uri?: string } | string | number;
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

// ── Sub-components ────────────────────────────────────────────────────────────

function DatePill({ label }: { label: string }) {
  return (
    <View style={styles.dateRow}>
      <View style={styles.datePill}>
        <Text style={styles.dateText}>{label}</Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={styles.typingRow}>
      <View style={styles.typingBubble}>
        <View style={styles.typingDot} />
        <View style={[styles.typingDot, { opacity: 0.6 }]} />
        <View style={[styles.typingDot, { opacity: 0.4 }]} />
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";

  const {
    messages,
    isTyping,
    currentStep,
    isComplete,
    sendUserMessage,
    sendVoiceNote,
    sendImage,
    selectQuickReply,
    resetConversation,
    editReport,
    saveReport,
  } = useChat();

  const listRef = useRef<FlatList<Message>>(null);
  const [composer, setComposer] = useState("");
  const [clientModalVisible, setClientModalVisible] = useState(false);
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [signature, setSignature] = useState<SignatureData | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, isTyping]);

  const handleSend = useCallback(() => {
    const value = composer.trim();
    if (!value) return;
    setComposer("");
    if (Platform.OS !== "web") Haptics.selectionAsync();
    sendUserMessage(value);
  }, [composer, sendUserMessage]);

  const handleNewReport = useCallback(() => {
    if (Platform.OS !== "web") Haptics.selectionAsync();
    if (Platform.OS === "web") {
      if (window.confirm("¿Iniciar un nuevo reporte? Se perderá el reporte actual.")) {
        resetConversation();
      }
      return;
    }
    Alert.alert(
      "Nuevo reporte",
      "¿Iniciar un nuevo reporte? Se perderá el reporte actual.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Nuevo reporte",
          style: "destructive",
          onPress: () => resetConversation(),
        },
      ],
    );
  }, [resetConversation]);

  const handleQuickReply = useCallback(
    (option: { label: string; value: string }) => {
      if (Platform.OS !== "web") Haptics.selectionAsync();
      selectQuickReply(option);
    },
    [selectQuickReply],
  );

  const handleSendVoice = useCallback(
    (uri: string, durationSec: number) => {
      if (Platform.OS !== "web")
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      sendVoiceNote(uri, durationSec);
    },
    [sendVoiceNote],
  );

  const renderItem = useCallback(
    ({ item }: { item: Message }) => {
      if (item.kind === "summary") {
        return (
          <SummaryCard
            data={item.data}
            onEdit={() => {
              if (Platform.OS !== "web") Haptics.selectionAsync();
              editReport();
            }}
            onConfirm={() => {
              if (Platform.OS !== "web")
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              saveReport(signature?.dataUrl);
            }}
            onSignature={() => setSignatureModalVisible(true)}
            signature={signature}
          />
        );
      }
      if (item.kind === "voice") {
        return (
          <VoiceBubble
            author={item.author}
            time={item.time}
            status={item.status}
            durationSec={item.durationSec}
          />
        );
      }
      if (item.kind === "image") {
        return (
          <ImageBubble
            author={item.author}
            time={item.time}
            status={item.status}
            uri={item.uri}
          />
        );
      }
      return (
        <MessageBubble
          text={item.text}
          author={item.author}
          time={item.time}
          status={item.status}
        />
      );
    },
    [editReport, saveReport, signature],
  );

  const activeQuickReplies = currentStep?.quickReplies ?? [];

  const headerHeight = 64;
  const topPadding = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomPadding = isWeb ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Repeating TAS logo watermark — absolutely positioned behind everything */}
      <WatermarkBackground />

      <View
        style={[
          styles.headerWrap,
          { paddingTop: topPadding, backgroundColor: "#0A0A0A", borderBottomWidth: 1, borderBottomColor: "#2A2A2A" },
        ]}
      >
        <ChatHeader
          onGoHome={() => router.replace("/tas")}
          onConsultarCliente={() => setClientModalVisible(true)}
          onNewReport={handleNewReport}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior="padding"
        keyboardVerticalOffset={topPadding + headerHeight}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<DatePill label="HOY" />}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
        />

        {activeQuickReplies.length > 0 && !isComplete ? (
          <View style={styles.quickRow}>
            {activeQuickReplies.map((qr) => (
              <QuickReply
                key={qr.value}
                label={qr.label}
                onPress={() => handleQuickReply(qr)}
              />
            ))}
          </View>
        ) : null}

        <View style={[styles.inputWrap, { paddingBottom: bottomPadding }]}>
          {isComplete ? (
            <Pressable
              style={({ pressed }) => [
                styles.newReportBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              onPress={() => {
                if (Platform.OS !== "web")
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                resetConversation();
              }}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.newReportText}>Nuevo reporte</Text>
            </Pressable>
          ) : (
            <ChatInput
              value={composer}
              onChangeText={setComposer}
              onSend={handleSend}
              onSendVoice={handleSendVoice}
              onSendImage={(uri) => {
                if (Platform.OS !== "web") Haptics.selectionAsync();
                sendImage(uri);
              }}
              disabled={!!currentStep?.disableTyping}
              placeholder={
                currentStep?.disableTyping
                  ? "Selecciona una opción arriba"
                  : "Escribí o hablá tu reporte…"
              }
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <Footer />

      <ClientSearchModal
        visible={clientModalVisible}
        onClose={() => setClientModalVisible(false)}
      />

      <SignatureModal
        visible={signatureModalVisible}
        onClose={() => setSignatureModalVisible(false)}
        onConfirm={(data) => {
          setSignature(data);
          setSignatureModalVisible(false);
        }}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  watermarkNative: { opacity: 0.04 },
  headerWrap: { width: "100%" },
  kav: { flex: 1 },
  listContent: {
    paddingHorizontal: 8,
    paddingTop: 12,
    paddingBottom: 8,
    flexGrow: 1,
  },
  dateRow: { alignItems: "center", marginVertical: 12 },
  datePill: {
    backgroundColor: "#1C1C1C",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dateText: {
    color: "#9A9A9A",
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  typingRow: {
    flexDirection: "row",
    paddingHorizontal: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  typingBubble: {
    flexDirection: "row",
    backgroundColor: "#1C1C1C",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 5,
    alignItems: "center",
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#CC0000",
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: "#0A0A0A",
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
  },
  inputWrap: {
    backgroundColor: "#0A0A0A",
    paddingHorizontal: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: "#2A2A2A",
  },
  newReportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 28,
    marginHorizontal: 12,
    marginVertical: 6,
    gap: 8,
  },
  newReportText: {
    color: "#fff",
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
  },
});
