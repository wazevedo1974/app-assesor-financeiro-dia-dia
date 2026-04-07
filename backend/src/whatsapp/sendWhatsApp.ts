const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppText(toWaId: string, body: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.warn("[WhatsApp] WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID não definidos; mensagem não enviada:", body.slice(0, 80));
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toWaId.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4096) },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[WhatsApp] Falha ao enviar:", res.status, errText);
  }
}
