import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiBaseUrl } from "@/lib/saveReport";
import { Footer } from "./Footer";

// ── Watermark background ──────────────────────────────────────────────────────

const logoAsset = require("../assets/tas-logo-watermark.png") as number;

function WatermarkBackground() {
  if (Platform.OS !== "web") {
    return (
      <ImageBackground
        source={logoAsset}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFillObject, wm.native]}
      />
    );
  }
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

const wm = StyleSheet.create({
  native: { opacity: 0.04 },
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sucursal {
  id: string;
  nombre_comercial: string;
  display_name: string;
}

interface ClientResult {
  id: string;
  nombre_comercial: string;
  es_sucursal: boolean;
  sucursales: Sucursal[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HistoryView({
  clienteId,
  clienteNombre,
  onBack,
}: {
  clienteId: string;
  clienteNombre: string;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSummary(null);

    fetch(`${getApiBaseUrl()}/client-history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cliente_id: clienteId }),
    })
      .then((r) => r.json())
      .then((j: { summary?: string; error?: string }) => {
        if (cancelled) return;
        if (j.error) { setError(j.error); return; }
        setSummary(j.summary ?? "Sin historial.");
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [clienteId]);

  return (
    <View style={hist.wrap}>
      <WatermarkBackground />

      <View style={hist.header}>
        <Pressable onPress={onBack} hitSlop={8} style={hist.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#E9EDEF" />
        </Pressable>
        <Text style={hist.headerTitle} numberOfLines={1}>{clienteNombre}</Text>
      </View>

      <View style={hist.body}>
        {loading ? (
          <View style={hist.center}>
            <ActivityIndicator color="#CC0000" size="large" />
            <Text style={hist.hintText}>Consultando historial…</Text>
          </View>
        ) : error ? (
          <View style={hist.center}>
            <Ionicons name="warning-outline" size={32} color="#E06C75" />
            <Text style={[hist.hintText, { color: "#E06C75" }]}>{error}</Text>
          </View>
        ) : (
          <View style={hist.summaryCard}>
            <Text style={hist.summaryText}>{summary}</Text>
          </View>
        )}
      </View>

      <Footer />
    </View>
  );
}

const hist = StyleSheet.create({
  wrap: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: "#161616",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
    gap: 10,
    zIndex: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    color: "#F0F0F0",
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
  body: { flex: 1, padding: 16, zIndex: 1 },
  center: { alignItems: "center", paddingTop: 48, gap: 12 },
  hintText: {
    color: "#4A4A4A",
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },
  summaryCard: {
    backgroundColor: "#161616",
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2A2A2A",
  },
  summaryText: {
    color: "#E0E0E0",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 23,
  },
});

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ClientSearchModal({ visible, onClose }: Props) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 350);

  const [clients, setClients] = useState<ClientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedClient, setSelectedClient] = useState<{ id: string; nombre: string } | null>(null);

  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      setQuery("");
      setClients([]);
      setSelectedClient(null);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    setSearching(true);
    setSearchError(null);

    const url = `${getApiBaseUrl()}/clients/search?q=${encodeURIComponent(debouncedQuery)}`;

    fetch(url)
      .then((r) => r.json())
      .then((j: { clients?: ClientResult[]; error?: string }) => {
        if (cancelled) return;
        if (j.error) { setSearchError(j.error); setClients([]); return; }
        setClients(j.clients ?? []);
      })
      .catch((err) => {
        if (!cancelled) { setSearchError(String(err)); setClients([]); }
      })
      .finally(() => { if (!cancelled) setSearching(false); });

    return () => { cancelled = true; };
  }, [debouncedQuery, visible]);

  const handleSelectClient = useCallback((id: string, nombre: string) => {
    setSelectedClient({ id, nombre });
  }, []);

  const renderClient = useCallback(
    ({ item }: { item: ClientResult }) => (
      <View style={{ zIndex: 1 }}>
        <Pressable
          style={({ pressed }) => [list.row, pressed && list.rowPressed]}
          onPress={() => handleSelectClient(item.id, item.nombre_comercial)}
        >
          <View style={list.iconWrap}>
            <Ionicons name={item.sucursales.length > 0 ? "business-outline" : "person-outline"} size={18} color="#CC0000" />
          </View>
          <View style={list.textCol}>
            <Text style={list.name} numberOfLines={1}>{item.nombre_comercial}</Text>
            {item.sucursales.length > 0 && (
              <Text style={list.meta}>{item.sucursales.length} sucursal{item.sucursales.length !== 1 ? "es" : ""}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#3A3A3A" />
        </Pressable>

        {item.sucursales.map((s) => (
          <Pressable
            key={s.id}
            style={({ pressed }) => [list.row, list.subRow, pressed && list.rowPressed]}
            onPress={() => handleSelectClient(s.id, s.nombre_comercial)}
          >
            <View style={[list.iconWrap, { marginLeft: 20 }]}>
              <Ionicons name="git-branch-outline" size={15} color="#3A3A3A" />
            </View>
            <View style={list.textCol}>
              <Text style={[list.name, { fontSize: 14, color: "#9A9A9A" }]} numberOfLines={1}>↳ {s.display_name}</Text>
            </View>
            <Ionicons name="chevron-forward" size={14} color="#3A3A3A" />
          </Pressable>
        ))}
      </View>
    ),
    [handleSelectClient],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === "ios" ? "pageSheet" : "fullScreen"}
      onRequestClose={onClose}
    >
      <View style={root.container}>
        <WatermarkBackground />

        {selectedClient ? (
          <HistoryView
            clienteId={selectedClient.id}
            clienteNombre={selectedClient.nombre}
            onBack={() => setSelectedClient(null)}
          />
        ) : (
          <View style={root.inner}>
            {/* Header */}
            <View style={root.header}>
              <Text style={root.headerTitle}>Consultar cliente</Text>
              <Pressable onPress={onClose} hitSlop={10} style={root.closeBtn}>
                <Ionicons name="close" size={24} color="#E0E0E0" />
              </Pressable>
            </View>

            {/* Search bar */}
            <View style={root.searchWrap}>
              <Ionicons name="search" size={18} color="#3A3A3A" style={root.searchIcon} />
              <TextInput
                ref={inputRef}
                style={root.searchInput}
                placeholder="Buscar cliente…"
                placeholderTextColor="#3A3A3A"
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              {searching && <ActivityIndicator color="#CC0000" size="small" style={{ marginRight: 8 }} />}
            </View>

            {/* Results */}
            <View style={{ flex: 1 }}>
              {searchError ? (
                <View style={root.emptyWrap}>
                  <Ionicons name="warning-outline" size={28} color="#E06C75" />
                  <Text style={[root.emptyText, { color: "#E06C75" }]}>{searchError}</Text>
                </View>
              ) : clients.length === 0 && !searching ? (
                <View style={root.emptyWrap}>
                  <Ionicons name="search-outline" size={36} color="#2A2A2A" />
                  <Text style={root.emptyText}>
                    {query.length === 0 ? "Escribe el nombre del cliente" : "Sin resultados"}
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={clients}
                  keyExtractor={(item) => item.id}
                  renderItem={renderClient}
                  contentContainerStyle={root.listContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                />
              )}
            </View>

            <Footer />
          </View>
        )}
      </View>
    </Modal>
  );
}

const root = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  inner: {
    flex: 1,
    zIndex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: "#161616",
    borderBottomWidth: 1,
    borderBottomColor: "#2A2A2A",
  },
  headerTitle: {
    color: "#F0F0F0",
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
  },
  closeBtn: {
    padding: 4,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#161616",
    margin: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: "#F0F0F0",
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    paddingVertical: Platform.OS === "ios" ? 12 : 8,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    paddingTop: 72,
    gap: 12,
    zIndex: 1,
  },
  emptyText: {
    color: "#3A3A3A",
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
  },
  listContent: {
    paddingHorizontal: 4,
    paddingBottom: 24,
  },
});

const list = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2A2A2A",
    gap: 10,
  },
  subRow: {
    paddingVertical: 10,
    backgroundColor: "#0D0D0D",
  },
  rowPressed: {
    backgroundColor: "#1C1C1C",
  },
  iconWrap: {
    width: 32,
    alignItems: "center",
  },
  textCol: {
    flex: 1,
  },
  name: {
    color: "#F0F0F0",
    fontFamily: "Inter_500Medium",
    fontSize: 16,
  },
  meta: {
    color: "#4A4A4A",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
});
