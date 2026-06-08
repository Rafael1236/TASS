import { useState, useRef, useEffect } from "react";
import { usePostDashboardChat, DashboardChatMessage } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<DashboardChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hola. Soy el asistente de TAS. Puedes preguntarme sobre técnicos, clientes, reportes o cotizaciones pendientes.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const chatMutation = usePostDashboardChat();

  useEffect(() => {
    if (open && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, open]);

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return;

    const userMessage = message.trim();
    setMessage("");

    const newHistory = [...history, { role: "user" as const, content: userMessage }];
    setHistory(newHistory);

    chatMutation.mutate(
      { data: { message: userMessage, history } },
      {
        onSuccess: (data) => {
          setHistory((prev) => [
            ...prev,
            { role: "assistant", content: data.answer },
          ]);
        },
        onError: () => {
          setHistory((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Error al comunicarse con el asistente. Por favor, intenta de nuevo.",
            },
          ]);
        },
      },
    );
  };

  return (
    <>
      {/* Floating trigger button */}
      <Button
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50"
        aria-label="Abrir asistente"
      >
        {open ? (
          <X className="h-6 w-6 text-primary-foreground" />
        ) : (
          <MessageCircle className="h-6 w-6 text-primary-foreground" />
        )}
      </Button>

      {/* Chat panel — anchored above the button, never goes off-screen */}
      {open && (
        <div
          className="fixed z-40 flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
          style={{
            width: "380px",
            maxWidth: "calc(100vw - 24px)",
            height: "min(70vh, 560px)",
            bottom: "88px",   /* 56px button + 8px gap + 24px margin */
            right: "24px",
          }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card/80 backdrop-blur shrink-0">
            <MessageCircle className="h-5 w-5 text-primary" />
            <span className="font-semibold text-sm text-foreground">Asistente TAS</span>
            <button
              onClick={() => setOpen(false)}
              className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages — scrollable, fills available space */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
            {history.map((msg, i) => (
              <div
                key={i}
                className={`flex w-max max-w-[88%] flex-col rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex w-max items-center gap-2 rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Pensando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input — always pinned at bottom */}
          <div className="px-4 py-3 border-t border-border bg-card shrink-0">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <Input
                type="text"
                placeholder="Escribe tu mensaje..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={chatMutation.isPending}
                className="flex-1 bg-background text-sm"
                autoFocus
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0"
                disabled={!message.trim() || chatMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
