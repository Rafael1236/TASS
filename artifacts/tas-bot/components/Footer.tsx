import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

const franquiciaLogo = require("../assets/franquicia-logo.png") as number;

export function Footer() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Franquicia operada por</Text>
      <Image
        source={franquiciaLogo}
        style={styles.logo}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 0,
  },
  text: {
    color: "#555",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.3,
  },
  logo: {
    height: 24,
    width: 151,
  },
});
