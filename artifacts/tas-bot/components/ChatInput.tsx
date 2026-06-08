import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface ChatInputProps {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  /** uri = local file path to the recorded audio, durationSec = wall-clock length */
  onSendVoice: (uri: string, durationSec: number) => void;
  onSendImage: (uri: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ChatInput({
  value,
  onChangeText,
  onSend,
  onSendVoice,
  onSendImage,
  disabled,
  placeholder,
}: ChatInputProps) {
  const hasText = value.trim().length > 0;
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number>(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Clean up any dangling recording on unmount
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
        recordingRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulse]);

  const startRecording = async () => {
    if (disabled) return;

    // On web, expo-av recording is not supported — skip silently
    if (Platform.OS === "web") {
      setRecording(true);
      setSeconds(0);
      startedAt.current = Date.now();
      intervalRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
      return;
    }

    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) return;

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Force .m4a (MPEG-4 AAC) on both iOS and Android.
      // HIGH_QUALITY preset on iOS defaults to .caf which Whisper rejects.
      const M4A_PRESET: Audio.RecordingOptions = {
        android: {
          extension: ".m4a",
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: ".m4a",
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: "audio/webm",
          bitsPerSecond: 128000,
        },
        isMeteringEnabled: false,
        keepAudioActiveHint: false,
      };

      const { recording: rec } = await Audio.Recording.createAsync(M4A_PRESET);
      recordingRef.current = rec;

      setRecording(true);
      setSeconds(0);
      startedAt.current = Date.now();
      intervalRef.current = setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
      }, 250);
    } catch (err) {
      console.warn("[ChatInput] startRecording failed", err);
    }
  };

  const stopAndSend = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    const total = Math.max(1, Math.floor((Date.now() - startedAt.current) / 1000));
    setRecording(false);
    setSeconds(0);

    if (Platform.OS === "web" || !recordingRef.current) {
      // Web: no actual audio — pass empty string so context can show error gracefully
      onSendVoice("", total);
      return;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recordingRef.current.getURI() ?? "";
      recordingRef.current = null;
      console.log("[ChatInput] audio URI:", uri, "duration:", total + "s");
      onSendVoice(uri, total);
    } catch (err) {
      console.warn("[ChatInput] stopAndSend failed", err);
      recordingRef.current = null;
      onSendVoice("", total);
    }
  };

  const cancelRecording = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRecording(false);
    setSeconds(0);

    if (recordingRef.current) {
      try {
        await recordingRef.current.stopAndUnloadAsync();
        await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      } catch {}
      recordingRef.current = null;
    }
  };

  const pickFromLibrary = async () => {
    if (disabled) return;
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        quality: 0.7,
        allowsMultipleSelection: false,
      });
      if (!result.canceled && result.assets[0]) {
        onSendImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn("pickFromLibrary failed", err);
    }
  };

  const takePhoto = async () => {
    if (disabled) return;
    try {
      if (Platform.OS !== "web") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        onSendImage(result.assets[0].uri);
      }
    } catch (err) {
      console.warn("takePhoto failed", err);
    }
  };

  if (recording) {
    return (
      <View style={styles.row}>
        <Pressable
          onPress={cancelRecording}
          style={styles.cancelBtn}
          hitSlop={6}
        >
          <Ionicons name="trash-outline" size={22} color="#F15C6D" />
        </Pressable>

        <View style={styles.recordingBox}>
          <Animated.View style={[styles.recDot, { opacity: pulse }]} />
          <Text style={styles.recText}>Grabando…</Text>
          <Text style={styles.recTime}>{formatDuration(seconds)}</Text>
        </View>

        <Pressable
          onPress={stopAndSend}
          style={({ pressed }) => [
            styles.sendBtn,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          hitSlop={6}
        >
          <Ionicons name="send" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      <View style={[styles.inputBox, disabled && { opacity: 0.6 }]}>
        <Pressable style={styles.leadingBtn} hitSlop={6} disabled={disabled}>
          <Ionicons name="happy-outline" size={24} color="#8696A0" />
        </Pressable>

        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? "Mensaje"}
          placeholderTextColor="#9A9A9A"
          style={styles.input}
          multiline
          editable={!disabled}
          onSubmitEditing={hasText ? onSend : undefined}
          returnKeyType="send"
          blurOnSubmit={false}
        />

        <Pressable
          style={styles.trailingBtn}
          hitSlop={6}
          disabled={disabled}
          onPress={pickFromLibrary}
        >
          <MaterialCommunityIcons name="paperclip" size={22} color="#8696A0" />
        </Pressable>

        {!hasText ? (
          <Pressable
            style={styles.trailingBtn}
            hitSlop={6}
            disabled={disabled}
            onPress={takePhoto}
          >
            <Ionicons name="camera-outline" size={22} color="#8696A0" />
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={hasText ? onSend : startRecording}
        disabled={disabled}
        style={({ pressed }) => [
          styles.sendBtn,
          { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        ]}
        hitSlop={6}
      >
        {hasText ? (
          <Ionicons name="send" size={20} color="#FFFFFF" />
        ) : (
          <Ionicons name="mic" size={22} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 6,
  },
  inputBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#1C1C1C",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 4,
    paddingVertical: 4,
    minHeight: 44,
  },
  leadingBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  trailingBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    color: "#E9EDEF",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#1D9E75",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1C1C1C",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 44,
    gap: 10,
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#F15C6D",
  },
  recText: {
    color: "#E9EDEF",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  recTime: {
    color: "#8696A0",
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    marginLeft: "auto",
  },
});
