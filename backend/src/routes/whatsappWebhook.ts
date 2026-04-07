import { Router, Request, Response } from "express";
import crypto from "crypto";
import { handleInboundWhatsAppText } from "../whatsapp/messageHandler";

export const whatsappWebhookRouter = Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "";

whatsappWebhookRouter.post("/", (req: Request, res: Response) => {
  handleWhatsAppWebhookPost(req, res);
});

/** Verificação do webhook (Meta GET). */
whatsappWebhookRouter.get("/", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN && typeof challenge === "string") {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

function verifyMetaSignature(req: Request, rawBody: Buffer, appSecret: string): boolean {
  const sig = req.headers["x-hub-signature-256"];
  if (!sig || typeof sig !== "string" || !sig.startsWith("sha256=")) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * POST do webhook: use raw body para validar assinatura (opcional).
 * Registar em server.ts ANTES de express.json() uma rota raw só para este path.
 */
function handleWhatsAppWebhookPost(req: Request, res: Response): void {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const raw = (req as Request & { rawBody?: Buffer }).rawBody;

  if (appSecret) {
    if (!raw || !verifyMetaSignature(req, raw, appSecret)) {
      res.sendStatus(403);
      return;
    }
  }

  res.sendStatus(200);

  void processWebhookPayload(req.body);
}

async function processWebhookPayload(body: unknown): Promise<void> {
  try {
    const b = body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{
              from?: string;
              type?: string;
              text?: { body?: string };
            }>;
          };
        }>;
      }>;
    };

    const messages = b.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;

    for (const msg of messages) {
      if (msg.type !== "text" || !msg.from || !msg.text?.body) continue;
      await handleInboundWhatsAppText(msg.from, msg.text.body);
    }
  } catch (e) {
    console.error("[WhatsApp] Erro ao processar webhook:", e);
  }
}
