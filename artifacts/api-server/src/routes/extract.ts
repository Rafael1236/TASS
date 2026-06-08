import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const SYSTEM_PROMPT = `Eres un extractor experto de datos estructurados de reportes de técnicos de servicio en campo. Recibirás el historial COMPLETO de lo que el técnico ha narrado en español — puede ser texto conversacional, frases sueltas, una descripción en un solo párrafo, o una mezcla. Tu objetivo es extraer TODOS los campos posibles con máximo esfuerzo, incluso si la información aparece de forma implícita o coloquial.

Devuelve SOLO JSON válido, sin markdown, sin texto adicional, sin bloques de código. La estructura DEBE ser exactamente:

{
  "tecnico_nombre": "",
  "cliente_nombre": "",
  "numero_llamada": "",
  "numero_proyecto": "",
  "tipo_servicio": [],
  "trabajo_realizado": "",
  "reporte_repuestos": [{"cantidad": "", "descripcion": ""}],
  "reporte_tecnicos": [{"nombre": "", "es_subcontrato": false}],
  "hora_entrada": "",
  "hora_salida": "",
  "estado_servicio": "",
  "hay_cotizacion": false,
  "descripcion_cotizacion": "",
  "observaciones": "",
  "hay_tecnicos_auxiliares": false,
  "hay_subcontrato": false,
  "cantidad_subcontrato": "",
  "placa_vehiculo": ""
}

GUÍA DE RECONOCIMIENTO DE FRASES EN ESPAÑOL:
- "soy / me llamo / el técnico es / fui yo / técnico:" → tecnico_nombre
- "visité a / el cliente es / fui a / estuve en / el cliente / empresa / local:" → cliente_nombre
- "llamada / número de llamada / # llamada / SAP / ticket / número SAP / la llamada es / call:" → numero_llamada
- "proyecto / número de proyecto / # proyecto / proyecto número / proj:" → numero_proyecto
- "hice / realicé / se hizo / trabajo realizado / se realizó / se instaló / se configuró / se revisó / se reparó / se cambió" → trabajo_realizado
- "entré a las / llegué a las / hora de llegada / ingresé / entrada:" → hora_entrada
- "salí a las / terminé a las / hora de salida / me fui a las / salida:" → hora_salida
- "quedó / estado / terminado / terminamos / pendiente / requiere / necesita otra visita" → estado_servicio
- "cotizar / presupuesto / hay que cotizar / se debe cotizar / necesita cotización / se va a cotizar" → hay_cotizacion = true; lo que se va a cotizar → descripcion_cotizacion
- "repuesto / material / usé / utilizamos / se instaló / pieza / cable / switch / router / equipo / accesorio" → reporte_repuestos
- "vine solo / fui solo / estuve solo / nadie más de TAS" → hay_tecnicos_auxiliares = false; reporte_tecnicos = []
- "acompañado de / junto con / también estuvo / apoyo de / vino [nombre] de TAS / me ayudó [nombre]" → hay_tecnicos_auxiliares = true; reporte_tecnicos contiene esos nombres con es_subcontrato: false
- "personal subcontratado / empresa externa / subcontratado / vino personal de / había X personas del subcontrato / subcontratistas" → hay_subcontrato = true; cuántas personas → cantidad_subcontrato (solo el número, como string)
- "no había subcontrato / sin subcontrato / no hubo subcontratados" → hay_subcontrato = false
- "placa / placa del carro / placa del vehículo / fui en el carro / viajé en / vehículo placa / placa número / el pick up / la moto / el panel / plate:" → placa_vehiculo. Extrae el código de placa exacto (letras y números, ej: P3897A, P62FA0, M622021). Si mencionan el carro sin placa, deja vacío.

REGLAS ESTRICTAS:
- Extrae TODO lo que puedas. Si una información está implícita, infiere con sentido común. Solo deja vacío si realmente no hay ninguna pista.
- "tipo_servicio" es array. Valores permitidos ÚNICAMENTE: "Mantenimiento", "Soporte", "Instalación", "Reparación", "Cableado", "Programación", "Capacitación", "Garantía", "Estudio", "Entrega". Pueden ser varios a la vez.
- "estado_servicio" debe ser exactamente uno de: "Terminado", "Pendiente de repuesto", "Requiere visita adicional", "En proceso". Si el técnico dice que terminó o que quedó listo → "Terminado".
- "hora_entrada" y "hora_salida" en formato HH:MM de 24 horas. Acepta cualquier formato de entrada: "8:30 am" → "08:30", "3pm" → "15:00", "9" → "09:00", "9am-11:30am" → extrae ambas. Si dice "9am a 11:30am", hora_entrada="09:00" y hora_salida="11:30".
- "hay_cotizacion" es boolean (true/false). Si mencionan cotizar, presupuestar o que hay que comprar algo → true.
- "hay_tecnicos_auxiliares" es boolean. true si vinieron otros técnicos de TAS a ayudar. false si vino solo o si se confirma que no hubo otros técnicos TAS.
- "reporte_tecnicos": técnicos TAS AUXILIARES que acompañaron (es_subcontrato siempre false). NO incluyas al técnico principal.
- "hay_subcontrato" es boolean (true/false). Si hay personal externo/subcontratado en el sitio → true.
- "cantidad_subcontrato": número de personas subcontratadas como string (ej: "3"). NO pedir nombres, solo la cantidad. Si no se menciona, dejar vacío.
- "reporte_repuestos": INCLUYE TODO material físico mencionado. Cada elemento {cantidad, descripcion}. Si no menciona cantidad, omite el campo cantidad.
- "numero_llamada" y "numero_proyecto" son strings (pueden contener letras, guiones, etc.).
- "placa_vehiculo" es string. Extrae solo el código de placa (letras+números, sin espacios). Normaliza a mayúsculas. Deja vacío si no hay placa mencionada.
- Si el técnico dice "vine solo" → hay_tecnicos_auxiliares = false; hay_subcontrato = false (a menos que mencione subcontrato por separado).

No agregues comentarios ni explicaciones. Solo devuelve el JSON.`;

interface ExtractRequest {
  transcript: string;
}

router.post("/extract", async (req, res) => {
  const { transcript } = (req.body ?? {}) as Partial<ExtractRequest>;

  req.log.info({ transcriptLength: (transcript ?? "").length, transcriptPreview: (transcript ?? "").slice(0, 300) }, "[extract] incoming transcript");

  if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
    res.status(400).json({ error: "transcript is required" });
    return;
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    req.log.error("ANTHROPIC_API_KEY is not set");
    res.status(500).json({ error: "Anthropic API key not configured" });
    return;
  }

  const client = new Anthropic({ apiKey });

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: transcript }],
    });

    const textBlock = response.content.find((c) => c.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      res.status(502).json({ error: "Empty response from model" });
      return;
    }

    const raw = textBlock.text.trim();
    req.log.info({ claudeRaw: raw }, "[extract] Claude raw response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) {
        req.log.error({ raw }, "Model did not return JSON");
        res.status(502).json({ error: "Model did not return JSON" });
        return;
      }
      parsed = JSON.parse(match[0]);
    }

    req.log.info({ parsed }, "[extract] parsed result");
    res.json(parsed);
  } catch (err) {
    req.log.error({ err }, "Claude extraction failed");
    res.status(500).json({ error: "Extraction failed" });
  }
});

export default router;
