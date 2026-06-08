import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const THEME_KEY = "tas-bot:theme:v1";

export type ThemeColors = {
  bg: string;
  bgDeep: string;
  bgSecondary: string;
  card: string;
  cardAlt: string;
  input: string;
  inputBorder: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  textPlaceholder: string;
  border: string;
  divider: string;
  accent: string;
};

export const DARK: ThemeColors = {
  bg: "#111111",
  bgDeep: "#0A0A0A",
  bgSecondary: "#1C1C1C",
  card: "#1C1C1C",
  cardAlt: "#161616",
  input: "#2A2A2A",
  inputBorder: "#2A2A2A",
  text: "#FFFFFF",
  textSecondary: "#9A9A9A",
  textMuted: "#555555",
  textPlaceholder: "#3A3A3A",
  border: "#333333",
  divider: "#1E1E1E",
  accent: "#CC0000",
};

export const LIGHT: ThemeColors = {
  bg: "#F5F5F5",
  bgDeep: "#EBEBEB",
  bgSecondary: "#EBEBEB",
  card: "#FFFFFF",
  cardAlt: "#F0F0F0",
  input: "#FFFFFF",
  inputBorder: "#E0E0E0",
  text: "#111111",
  textSecondary: "#555555",
  textMuted: "#888888",
  textPlaceholder: "#AAAAAA",
  border: "#E0E0E0",
  divider: "#E8E8E8",
  accent: "#CC0000",
};

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((v) => { if (v === "light") setIsDark(false); })
      .catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      AsyncStorage.setItem(THEME_KEY, next ? "dark" : "light").catch(() => {});
      return next;
    });
  }, []);

  const colors = useMemo(() => (isDark ? DARK : LIGHT), [isDark]);

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
