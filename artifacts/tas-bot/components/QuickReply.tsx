import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

interface QuickReplyProps {
  label: string;
  onPress: () => void;
}

export function QuickReply({ label, onPress }: QuickReplyProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        pressed && styles.chipPressed,
      ]}
    >
      {({ pressed }) => (
        <Text style={[styles.label, pressed && styles.labelPressed]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: "#1C1C1C",
    borderColor: "#CC0000",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipPressed: {
    backgroundColor: "#CC0000",
  },
  label: {
    color: "#FFFFFF",
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  labelPressed: {
    color: "#FFFFFF",
  },
});
