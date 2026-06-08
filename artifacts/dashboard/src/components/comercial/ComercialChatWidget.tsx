import { useState, useRef, useEffect } from "react";
import { usePostComercialChat } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, Send, X, Loader2 } from "lucide-react";

interface Msg { role: "user" | "assistant"; content: string }

export function ComercialChatWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<Msg[]>([
    {
      role: "assistant",
      content: "Hola. Soy el asistente comercial de TAS. Puedes preguntarme por cotizaciones pendientes, tasas de conversión o el estado de las oportunidades por vendedor.",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const chatMutation = usePostComercialChat();

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, open]);

  const handleSend = () => {
    if (!message.trim() || chatMutation.isPending) return;
    const userMsg = message.trim();
    setMessage("");
    const newHistory = [...history, { role: "user" as const, content: userMsg }];
    setHistory(newHistory);

    chatMutation.mutate(
      { data: { message: userMsg, history } },
      {
        onSuccess: (data) => {
          setHistory((prev) => [...prev, { role: "assistant", content: data.answer }]);
        },
        onError: () => {
          setHistory((prev) => [...prev, { role: "assistant", content: "Error al comunicarse con el asistente." }]);
        },
      },
    );
  };

  return (
    <>
      <Button
        size="icon"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 bg-[#CC0000] hover:bg-[#AA0000]"
        aria-label="Abrir asistente comercial"
      >
        {open ? <X className="h-6 w-6 text-white" /> : <MessageCircle className="h-6 w-6 text-white" />}
      </Button>

      {open && (
        <div
          className="fixed z-40 flex flex-col bg-[#2D2D2D] border border-border rounded-xl shadow-2xl overflow-hidden"
          style={{ width: "380px", maxWidth: "calc(100vw - 24px)", height: "min(70vh, 560px)", bottom: "88px", right: "24px" }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
            <div className="h-2 w-2 rounded-full bg-[#CC0000]" />
            <span className="font-semibold text-sm text-white">Asistente Comercial</span>
            <button onClick={() => setOpen(false)} className="ml-auto text-muted-foreground hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 min-h-0">
            {history.map((msg, i) => (
              <div
                key={i}
                className={`flex w-max max-w-[88%] flex-col rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "ml-auto bg-[#CC0000] text-white"
                    : "bg-black/30 text-foreground"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex w-max items-center gap-2 rounded-lg px-3 py-2 text-sm bg-black/30 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Pensando...
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div className="px-4 py-3 border-t border-border shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex items-center gap-2">
              <Input
                type="text"
                placeholder="Ej: ¿Cuántas cotizaciones tiene Juan pendientes?"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={chatMutation.isPending}
                className="flex-1 bg-background text-sm"
                autoFocus
              />
              <Button type="submit" size="icon" className="shrink-0 bg-[#CC0000] hover:bg-[#AA0000]" disabled={!message.trim() || chatMutation.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
