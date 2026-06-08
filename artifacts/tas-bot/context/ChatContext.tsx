import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DONE_MESSAGE,
  EDIT_PROMPT,
  FIELD_ORDER,
  OMITIR_VALUE,
  STEP_BY_FIELD,
  buildGreeting,
  findNextField,
  parseTimePair,
  type ConversationStep,
  type QuickReplyOption,
  type ReportData,
  type ReportField,
} from "@/lib/conversation";
import { extractReportFields } from "@/lib/extractor";
import { saveReportToBackend } from "@/lib/saveReport";
import { useAuth } from "@/context/AuthContext";

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type Author = "bot" | "user";

export type Message =
  | {
      id: string;
      kind: "text";
      author: Author;
      text: string;
      time: string;
      status?: "sent" | "delivered" | "read";
    }
  | {
      id: string;
      kind: "voice";
      author: Author;
      durationSec: number;
      time: string;
      status?: "sent" | "delivered" | "read";
    }
  | {
      id: string;
      kind: "image";
      author: Author;
      uri: string;
      time: string;
      status?: "sent" | "delivered" | "read";
    }
  | {
      id: string;
      kind: "summary";
      author: "bot";
      time: string;
      data: ReportData;
    };

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type Phase = "collecting" | "complete";

interface ChatState {
  phase: Phase;
  data: ReportData;
  /** Accumulated user inputs (typed text + transcribed audio, NOT chip labels). */
  transcript: string[];
  /** Which field the bot is currently asking about. null when all done. */
  currentField: ReportField | null;
  messages: Message[];
}

interface SavedReport {
  id: string;
  savedAt: string;
  data: ReportData;
}

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface ChatContextValue {
  messages: Message[];
  isTyping: boolean;
  isComplete: boolean;
  /** The step definition for the field currently being asked, or null. */
  currentStep: ConversationStep | null;
  sendUserMessage: (text: string) => void;
  sendVoiceNote: (uri: string, durationSec: number) => Promise<void>;
  sendImage: (uri: string) => void;
  selectQuickReply: (option: QuickReplyOption) => void;
  resetConversation: () => void;
  editReport: () => void;
  saveReport: (firmaDataUrl?: string) => void;
  savedReports: SavedReport[];
}

// ---------------------------------------------------------------------------
// Storage key — bump version when state shape changes
// ---------------------------------------------------------------------------

const STORAGE_KEY = "tas-bot:chat:v7";
const REPORTS_KEY = "tas-bot:reports:v4";

// ---------------------------------------------------------------------------
// Pure helpers (defined outside component so they don't cause re-renders)
// ---------------------------------------------------------------------------

function nowTime(): string {
  const d = new Date();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function appendBotText(prev: ChatState, text: string): ChatState {
  return {
    ...prev,
    messages: [
      ...prev.messages,
      { id: uid(), kind: "text", author: "bot", text, time: nowTime() },
    ],
  };
}

function appendBotSummary(prev: ChatState, data: ReportData): ChatState {
  return {
    ...prev,
    messages: [
      ...prev.messages,
      { id: uid(), kind: "summary", author: "bot", time: nowTime(), data },
    ],
  };
}

function buildInitialState(tecnicoNombre?: string): ChatState {
  const time = nowTime();
  const preFilledData: ReportData = {};
  if (tecnicoNombre) {
    preFilledData.tecnico_nombre = tecnicoNombre;
  }
  const firstField = findNextField(preFilledData) ?? FIELD_ORDER[0]!;
  const firstStep = STEP_BY_FIELD[firstField];
  const firstName = tecnicoNombre ? tecnicoNombre.split(" ")[0] : undefined;
  const greeting = buildGreeting(firstName);
  return {
    phase: "collecting",
    data: preFilledData,
    transcript: [],
    currentField: firstField,
    messages: [
      {
        id: uid(),
        kind: "text",
        author: "bot",
        text: greeting,
        time,
      },
      {
        id: uid(),
        kind: "text",
        author: "bot",
        text: firstStep.prompt(preFilledData),
        time,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { tecnico } = useAuth();
  const [state, setState] = useState<ChatState>(() => buildInitialState());
  const [hydrated, setHydrated] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);

  const typingTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [chatRaw, reportsRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(REPORTS_KEY),
        ]);
        if (cancelled) return;
        if (chatRaw) {
          try {
            const parsed = JSON.parse(chatRaw) as ChatState;
            if (parsed && Array.isArray(parsed.messages)) {
              setState(parsed);
            }
          } catch {}
        }
        if (reportsRaw) {
          try {
            const parsed = JSON.parse(reportsRaw) as SavedReport[];
            if (Array.isArray(parsed)) setSavedReports(parsed);
          } catch {}
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, hydrated]);

  useEffect(() => {
    return () => {
      typingTimers.current.forEach(clearTimeout);
    };
  }, []);

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const isComplete = state.phase === "complete";

  const currentStep = useMemo<ConversationStep | null>(() => {
    if (!state.currentField || state.phase !== "collecting") return null;
    return STEP_BY_FIELD[state.currentField];
  }, [state.currentField, state.phase]);

  // -------------------------------------------------------------------------
  // Core helper: queue a bot response with a short typing delay
  // -------------------------------------------------------------------------

  const queueBotResponse = useCallback(
    (apply: (prev: ChatState) => ChatState, delayMs = 700) => {
      setIsTyping(true);
      const t = setTimeout(() => {
        setIsTyping(false);
        setState(apply);
      }, delayMs);
      typingTimers.current.push(t);
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Core helper: advance to the next field or finish the report
  // Called after data has already been updated in state.
  //
  // IMPORTANT: findNextField is computed INSIDE the setState callback so it
  // always uses the most recent state. This prevents a race condition where
  // a chip tap sets a field and then Claude's async extraction overwrites
  // it (because Claude ran against pre-tap state), causing the bot to ask
  // the same question again.
  // -------------------------------------------------------------------------

  const advanceToNextField = useCallback(
    (newData: ReportData, newTranscript: string[], delay = 700) => {
      queueBotResponse((prev) => {
        // Merge: prefer non-empty values already in prev.data over newData.
        // This ensures concurrent chip taps / omits are never overwritten
        // by a Claude extraction that started before the chip was tapped.
        const merged: ReportData = { ...newData };
        for (const _key of Object.keys(prev.data) as ReportField[]) {
          const prevVal = prev.data[_key];
          if (prevVal && prevVal.trim().length > 0) {
            merged[_key] = prevVal;
          }
        }
        // Fotos: union of both arrays
        const allFotos = Array.from(
          new Set([...(newData.fotos ?? []), ...(prev.data.fotos ?? [])]),
        );
        if (allFotos.length > 0) merged.fotos = allFotos;

        // Use the longer transcript (more complete)
        const resolvedTranscript =
          prev.transcript.length > newTranscript.length
            ? prev.transcript
            : newTranscript;

        const nextField = findNextField(merged);
        if (!nextField) {
          // Only add the done message if it isn't already the last bot message
          const lastMsg = prev.messages[prev.messages.length - 1];
          const alreadyDone =
            lastMsg?.author === "bot" &&
            lastMsg?.kind === "text" &&
            lastMsg.text === DONE_MESSAGE;
          if (alreadyDone) {
            return { ...prev, phase: "complete", data: merged, transcript: resolvedTranscript, currentField: null };
          }
          return {
            ...appendBotSummary(appendBotText(prev, DONE_MESSAGE), merged),
            phase: "complete",
            data: merged,
            transcript: resolvedTranscript,
            currentField: null,
          };
        }
        const nextStep = STEP_BY_FIELD[nextField];
        const nextPrompt = nextStep.prompt(merged);

        // Deduplication: if the bot already asked this exact question as the
        // last message, don't add a duplicate — just silently update state.
        const lastBotMsg = [...prev.messages].reverse().find((m) => m.author === "bot");
        const alreadyAsked =
          lastBotMsg?.kind === "text" && lastBotMsg.text === nextPrompt;
        if (alreadyAsked) {
          return {
            ...prev,
            data: merged,
            transcript: resolvedTranscript,
            currentField: nextField,
          };
        }

        return {
          ...appendBotText(prev, nextPrompt),
          data: merged,
          transcript: resolvedTranscript,
          currentField: nextField,
        };
      }, delay);
    },
    [queueBotResponse],
  );

  // -------------------------------------------------------------------------
  // SINGLE PIPELINE — text and audio go through Claude extraction
  // -------------------------------------------------------------------------

  const handleUserInput = useCallback(
    async (text: string) => {
      if (state.phase !== "collecting") return;

      const newTranscript = [...state.transcript, text];
      const fullTranscript = newTranscript.join("\n");

      // Step 1: Echo user message and update transcript immediately
      setState((prev) => ({
        ...prev,
        transcript: newTranscript,
        messages: [
          ...prev.messages,
          {
            id: uid(),
            kind: "text",
            author: "user",
            text,
            time: nowTime(),
            status: "read",
          },
        ],
      }));

      // Step 2: Client-side time parsing (runs before Claude for the hora_entrada step)
      // When the user answers the combined time question, extract both times locally.
      let preData = state.data;
      if (state.currentField === "hora_entrada") {
        const parsed = parseTimePair(text);
        const timeUpdates: Partial<ReportData> = {};
        if (parsed.entrada) timeUpdates.hora_entrada = parsed.entrada;
        if (parsed.salida) timeUpdates.hora_salida = parsed.salida;
        if (Object.keys(timeUpdates).length > 0) {
          preData = { ...preData, ...timeUpdates };
        }
      }

      // Step 3: Send full transcript to Claude (starting from pre-processed data)
      setIsTyping(true);
      let newData = preData;
      try {
        newData = await extractReportFields(text, preData, fullTranscript);
      } catch {
        // Keep pre-processed data on extraction error — still advance
      }
      setIsTyping(false);

      // Step 3b: Raw-text fallback — if Claude didn't fill the field the bot
      // was explicitly asking about, use the user's raw text directly.
      // This prevents infinite loops on fields like descripcion_cotizacion or
      // observaciones where Claude may not recognize short standalone answers.
      const askedField = state.currentField;
      if (
        askedField &&
        !newData[askedField] &&
        !STEP_BY_FIELD[askedField].disableTyping &&
        text.trim().length > 0
      ) {
        newData = { ...newData, [askedField]: text.trim() };
      }

      // Step 4: Find next missing field and ask for it (or show summary)
      advanceToNextField(newData, newTranscript, 400);
    },
    [state.phase, state.data, state.transcript, advanceToNextField],
  );

  // -------------------------------------------------------------------------
  // Chip tap — known value, set directly without Claude round-trip
  // -------------------------------------------------------------------------

  const handleChipValue = useCallback(
    (field: ReportField, value: string, label: string) => {
      if (state.phase !== "collecting") return;

      // Use functional setState so we always work from the latest state,
      // not a potentially stale closure value.
      let capturedData: ReportData = {};
      let capturedTranscript: string[] = [];
      setState((prev) => {
        const newData = { ...prev.data, [field]: value };
        const newTranscript = [...prev.transcript, label];
        capturedData = newData;
        capturedTranscript = newTranscript;
        return {
          ...prev,
          data: newData,
          transcript: newTranscript,
          messages: [
            ...prev.messages,
            {
              id: uid(),
              kind: "text",
              author: "user",
              text: label,
              time: nowTime(),
              status: "read",
            },
          ],
        };
      });

      // Schedule bot response — advanceToNextField also merges with latest state
      // so capturedData just seeds the merge; prev.data takes precedence.
      advanceToNextField(capturedData, capturedTranscript);
    },
    [state.phase, advanceToNextField],
  );

  // -------------------------------------------------------------------------
  // Omitir — skip the current optional field, no Claude needed
  // -------------------------------------------------------------------------

  const handleOmitir = useCallback(() => {
    if (state.phase !== "collecting" || !state.currentField) return;

    // Capture currentField now (synchronous) before any async state updates
    const fieldToSkip = state.currentField;

    let capturedData: ReportData = {};
    let capturedTranscript: string[] = [];
    setState((prev) => {
      const newData = { ...prev.data, [fieldToSkip]: OMITIR_VALUE };
      const newTranscript = prev.transcript; // "Omitir" is NOT added to transcript
      capturedData = newData;
      capturedTranscript = newTranscript;
      return {
        ...prev,
        data: newData,
        messages: [
          ...prev.messages,
          {
            id: uid(),
            kind: "text",
            author: "user",
            text: "Omitir",
            time: nowTime(),
            status: "read",
          },
        ],
      };
    });

    advanceToNextField(capturedData, capturedTranscript, 400);
  }, [state.phase, state.currentField, advanceToNextField]);

  // -------------------------------------------------------------------------
  // Public: sendUserMessage
  // -------------------------------------------------------------------------

  const sendUserMessage = useCallback(
    (rawText: string) => {
      const text = rawText.trim();
      if (!text || state.phase !== "collecting") return;
      void handleUserInput(text);
    },
    [state.phase, handleUserInput],
  );

  // -------------------------------------------------------------------------
  // Public: selectQuickReply
  // -------------------------------------------------------------------------

  const selectQuickReply = useCallback(
    (option: QuickReplyOption) => {
      if (state.phase !== "collecting") return;

      // "Omitir" chip → skip the current field
      if (
        option.value === OMITIR_VALUE ||
        option.value.toLowerCase() === "omitir"
      ) {
        handleOmitir();
        return;
      }

      // All other chips → direct field value (no Claude round-trip)
      if (state.currentField) {
        handleChipValue(state.currentField, option.value, option.label);
      }
    },
    [
      state.phase,
      state.currentField,
      handleOmitir,
      handleChipValue,
    ],
  );

  // -------------------------------------------------------------------------
  // Public: sendVoiceNote
  // -------------------------------------------------------------------------

  const sendVoiceNote = useCallback(
    async (uri: string, durationSec: number) => {
      if (state.phase !== "collecting") return;

      const safeDuration = Math.max(1, Math.round(durationSec));

      // Echo voice bubble
      setState((prev) => ({
        ...prev,
        messages: [
          ...prev.messages,
          {
            id: uid(),
            kind: "voice",
            author: "user",
            durationSec: safeDuration,
            time: nowTime(),
            status: "read",
          },
        ],
      }));

      // Voice transcription removed — prompt user to type instead
      queueBotResponse(
        (prev) => appendBotText(prev, "Las notas de voz no están disponibles. Usa el dictado por voz de tu teclado para escribir 🎤"),
        500,
      );
    },
    [state.phase, queueBotResponse],
  );

  // -------------------------------------------------------------------------
  // Public: sendImage
  // -------------------------------------------------------------------------

  const sendImage = useCallback(
    (uri: string) => {
      if (!uri) return;
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          fotos: [...(prev.data.fotos ?? []), uri],
        },
        messages: [
          ...prev.messages,
          {
            id: uid(),
            kind: "image",
            author: "user",
            uri,
            time: nowTime(),
            status: "read",
          },
        ],
      }));
      queueBotResponse((prev) => appendBotText(prev, "Foto adjuntada ✓"), 500);
    },
    [queueBotResponse],
  );

  // -------------------------------------------------------------------------
  // Public: resetConversation
  // -------------------------------------------------------------------------

  const resetConversation = useCallback(() => {
    typingTimers.current.forEach(clearTimeout);
    typingTimers.current = [];
    setIsTyping(false);
    setState(buildInitialState(tecnico?.nombre));
  }, [tecnico]);

  // -------------------------------------------------------------------------
  // Public: editReport — go back to collecting, keep existing data
  // -------------------------------------------------------------------------

  const editReport = useCallback(() => {
    typingTimers.current.forEach(clearTimeout);
    typingTimers.current = [];
    setIsTyping(false);
    setState((prev) => {
      const nextField = findNextField(prev.data);
      return {
        ...appendBotText(prev, EDIT_PROMPT),
        phase: "collecting",
        currentField: nextField,
      };
    });
  }, []);

  // -------------------------------------------------------------------------
  // Public: saveReport
  // -------------------------------------------------------------------------

  const saveReport = useCallback(async (firmaDataUrl?: string) => {
    const report: SavedReport = {
      id: uid(),
      savedAt: new Date().toISOString(),
      data: state.data,
    };
    setSavedReports((prev) => {
      const next = [report, ...prev];
      AsyncStorage.setItem(REPORTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });

    setIsTyping(true);
    setState((prev) =>
      appendBotText(prev, "Guardando reporte en la base de datos…"),
    );

    try {
      const result = await saveReportToBackend(state.data, firmaDataUrl);
      setIsTyping(false);
      setState((prev) =>
        appendBotText(
          prev,
          `✅ Reporte #${result.numero_reporte} guardado exitosamente. Toca + para iniciar uno nuevo.`,
        ),
      );
    } catch (err) {
      setIsTyping(false);
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setState((prev) =>
        appendBotText(
          prev,
          `⚠️ No se pudo guardar el reporte (${msg}). Quedó respaldado en este teléfono.`,
        ),
      );
    }
  }, [state.data]);

  // -------------------------------------------------------------------------
  // Context value
  // -------------------------------------------------------------------------

  const value = useMemo<ChatContextValue>(
    () => ({
      messages: state.messages,
      isTyping,
      isComplete,
      currentStep,
      sendUserMessage,
      sendVoiceNote,
      sendImage,
      selectQuickReply,
      resetConversation,
      editReport,
      saveReport,
      savedReports,
    }),
    [
      state.messages,
      isTyping,
      isComplete,
      currentStep,
      sendUserMessage,
      sendVoiceNote,
      sendImage,
      selectQuickReply,
      resetConversation,
      editReport,
      saveReport,
      savedReports,
    ],
  );

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside ChatProvider");
  return ctx;
}

// Re-export for convenience
export type { ReportData, ReportField };
export { REQUIRED_FIELDS } from "@/lib/conversation";
