import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

export type Author = "bot" | "user";

interface BaseProps {
  author: Author;
  time: string;
  status?: "sent" | "delivered" | "read";
}

interface TextBubbleProps extends BaseProps {
  text: string;
}

export function MessageBubble({ text, author, time, status }: TextBubbleProps) {
  const isUser = author === "user";

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.botBubble,
          isUser ? styles.userTail : styles.botTail,
        ]}
      >
        <Text style={styles.text}>{text}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.timeText}>{time}</Text>
          {isUser ? (
            <Ionicons
              name="checkmark-done"
              size={14}
              color={status === "read" ? "#53BDEB" : "#8696A0"}
              style={{ marginLeft: 3 }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

interface VoiceBubbleProps extends BaseProps {
  durationSec: number;
}

export function VoiceBubble({
  author,
  time,
  status,
  durationSec,
}: VoiceBubbleProps) {
  const isUser = author === "user";
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const duration = `${mins}:${secs.toString().padStart(2, "0")}`;

  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.voiceBubble,
          isUser ? styles.userBubble : styles.botBubble,
          isUser ? styles.userTail : styles.botTail,
        ]}
      >
        <View style={styles.voiceRow}>
          <View style={styles.playBtn}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
          <View style={styles.waveform}>
            {Array.from({ length: 22 }).map((_, i) => {
              const heights = [4, 9, 14, 8, 5, 12, 16, 10, 6, 13, 18, 11, 7, 15, 9, 4, 12, 17, 8, 5, 11, 14];
              const h = heights[i % heights.length] ?? 8;
              return (
                <View
                  key={i}
                  style={[styles.waveBar, { height: h }]}
                />
              );
            })}
          </View>
          <View style={styles.micCircle}>
            <Ionicons name="mic" size={14} color="#00A884" />
          </View>
        </View>
        <View style={[styles.metaRow, { marginTop: 4 }]}>
          <Text style={styles.durationText}>{duration}</Text>
          <Text style={[styles.timeText, { marginLeft: "auto" }]}>{time}</Text>
          {isUser ? (
            <Ionicons
              name="checkmark-done"
              size={14}
              color={status === "read" ? "#53BDEB" : "#8696A0"}
              style={{ marginLeft: 3 }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

interface ImageBubbleProps extends BaseProps {
  uri: string;
}

export function ImageBubble({ uri, author, time, status }: ImageBubbleProps) {
  const isUser = author === "user";
  return (
    <View
      style={[
        styles.row,
        { justifyContent: isUser ? "flex-end" : "flex-start" },
      ]}
    >
      <View
        style={[
          styles.imageBubble,
          isUser ? styles.userBubble : styles.botBubble,
          isUser ? styles.userTail : styles.botTail,
        ]}
      >
        <Image
          source={{ uri }}
          style={styles.imagePreview}
          contentFit="cover"
          transition={150}
        />
        <View style={styles.imageMetaOverlay}>
          <Text style={styles.imageTimeText}>{time}</Text>
          {isUser ? (
            <Ionicons
              name="checkmark-done"
              size={14}
              color={status === "read" ? "#53BDEB" : "#E9EDEF"}
              style={{ marginLeft: 3 }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: 10,
    paddingTop: 7,
    paddingBottom: 6,
    borderRadius: 8,
  },
  voiceBubble: {
    maxWidth: "82%",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 8,
    minWidth: 230,
  },
  userBubble: {
    backgroundColor: "#005C4B",
    marginLeft: 60,
  },
  botBubble: {
    backgroundColor: "#1F2C34",
    marginRight: 60,
  },
  userTail: {
    borderTopRightRadius: 2,
  },
  botTail: {
    borderTopLeftRadius: 2,
  },
  text: {
    color: "#E9EDEF",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    marginTop: 2,
    marginLeft: 8,
  },
  timeText: {
    color: "#8696A0",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  durationText: {
    color: "#A8B7BE",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  voiceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  playBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  waveform: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 22,
  },
  waveBar: {
    width: 2,
    borderRadius: 1,
    backgroundColor: "#A8B7BE",
  },
  micCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  imageBubble: {
    maxWidth: "82%",
    padding: 3,
    borderRadius: 8,
  },
  imagePreview: {
    width: 220,
    height: 220,
    borderRadius: 6,
    backgroundColor: "#0B141A",
  },
  imageMetaOverlay: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  imageTimeText: {
    color: "#E9EDEF",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
});
