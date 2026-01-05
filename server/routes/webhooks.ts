import { Router, type Request, type Response } from "express";
import express from "express";
import crypto from "crypto";
import { db } from "../db.js";
import * as schema from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";
import { generateAIReply } from "../services/aiService.js";

const { socialAccounts, conversations, messages } = schema;

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "mt_hub_verify_token";

export const webhookRouter = Router();

webhookRouter.use(express.raw({ type: "application/json" }));

webhookRouter.use((req: any, res, next) => {
  if (req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch (e) {
      req.body = {};
    }
  }
  next();
});

webhookRouter.get("/meta", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("Meta webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

webhookRouter.post("/meta", async (req: any, res: Response) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  
  if (process.env.FACEBOOK_APP_SECRET && signature) {
    const rawBody = req.rawBody as Buffer;
    if (!rawBody) {
      console.error("Missing raw body for signature verification");
      return res.sendStatus(403);
    }
    
    const expectedSig = "sha256=" + crypto
      .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
      .update(rawBody)
      .digest("hex");
    
    if (signature !== expectedSig) {
      console.error("Invalid webhook signature");
      return res.sendStatus(403);
    }
  }

  const body = req.body;
  
  if (body.object === "page" || body.object === "instagram") {
    for (const entry of body.entry || []) {
      await processMessagingEntry(entry, body.object);
    }
  }

  res.sendStatus(200);
});

webhookRouter.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("WhatsApp webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

webhookRouter.post("/whatsapp", async (req: any, res: Response) => {
  const signature = req.headers["x-hub-signature-256"] as string;
  
  if (process.env.FACEBOOK_APP_SECRET && signature) {
    const rawBody = req.rawBody as Buffer;
    if (rawBody) {
      const expectedSig = "sha256=" + crypto
        .createHmac("sha256", process.env.FACEBOOK_APP_SECRET)
        .update(rawBody)
        .digest("hex");
      
      if (signature !== expectedSig) {
        console.error("Invalid WhatsApp webhook signature");
        return res.sendStatus(403);
      }
    }
  }

  const body = req.body;

  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      await processWhatsAppEntry(entry);
    }
  }

  res.sendStatus(200);
});

async function processMessagingEntry(entry: any, platform: string): Promise<void> {
  const pageId = entry.id;
  
  const account = await db.select().from(socialAccounts)
    .where(eq(socialAccounts.platformAccountId, pageId))
    .limit(1);

  if (account.length === 0) return;

  const messaging = entry.messaging || entry.messages || [];
  
  for (const event of messaging) {
    if (event.message) {
      await handleIncomingMessage(account[0], event, platform);
    }
  }
}

async function processWhatsAppEntry(entry: any): Promise<void> {
  const changes = entry.changes || [];
  
  for (const change of changes) {
    if (change.field === "messages") {
      const value = change.value;
      const phoneNumberId = value.metadata?.phone_number_id;
      
      const account = await db.select().from(socialAccounts)
        .where(and(
          eq(socialAccounts.platform, "whatsapp"),
          eq(socialAccounts.platformAccountId, phoneNumberId)
        ))
        .limit(1);

      if (account.length === 0) continue;

      for (const msg of value.messages || []) {
        await handleWhatsAppMessage(account[0], msg, value.contacts?.[0]);
      }
    }
  }
}

async function handleIncomingMessage(account: any, event: any, platform: string): Promise<void> {
  const senderId = event.sender?.id;
  const messageText = event.message?.text;
  const timestamp = new Date(event.timestamp || Date.now());

  if (!senderId || !messageText) return;

  let conversation = await db.select().from(conversations)
    .where(and(
      eq(conversations.socialAccountId, account.id),
      eq(conversations.externalConversationId, senderId)
    ))
    .limit(1);

  let conversationId: number;

  if (conversation.length === 0) {
    const [newConv] = await db.insert(conversations).values({
      userId: account.userId,
      socialAccountId: account.id,
      platform: platform === "page" ? "facebook" : "instagram",
      externalConversationId: senderId,
      contactName: `User ${senderId.slice(-4)}`,
      contactId: senderId,
      aiStatus: "auto",
      lastMessageAt: timestamp,
    }).returning();
    conversationId = newConv.id;
  } else {
    conversationId = conversation[0].id;
    await db.update(conversations)
      .set({ lastMessageAt: timestamp })
      .where(eq(conversations.id, conversationId));
  }

  await db.insert(messages).values({
    conversationId,
    direction: "inbound",
    content: messageText,
    externalMessageId: event.message?.mid,
    status: "delivered",
  });

  const conv = conversation.length > 0 ? conversation[0] : { aiStatus: "auto" };
  if (conv.aiStatus === "auto") {
    await triggerAutoReply(account, conversationId, senderId, messageText, platform);
  }
}

async function handleWhatsAppMessage(account: any, msg: any, contact: any): Promise<void> {
  const senderId = msg.from;
  const messageText = msg.text?.body || msg.button?.text || "";
  const timestamp = new Date(parseInt(msg.timestamp) * 1000);

  if (!senderId || !messageText) return;

  let conversation = await db.select().from(conversations)
    .where(and(
      eq(conversations.socialAccountId, account.id),
      eq(conversations.externalConversationId, senderId)
    ))
    .limit(1);

  let conversationId: number;

  if (conversation.length === 0) {
    const [newConv] = await db.insert(conversations).values({
      userId: account.userId,
      socialAccountId: account.id,
      platform: "whatsapp",
      externalConversationId: senderId,
      contactName: contact?.profile?.name || `+${senderId}`,
      contactId: senderId,
      aiStatus: "auto",
      lastMessageAt: timestamp,
    }).returning();
    conversationId = newConv.id;
  } else {
    conversationId = conversation[0].id;
    await db.update(conversations)
      .set({ lastMessageAt: timestamp })
      .where(eq(conversations.id, conversationId));
  }

  await db.insert(messages).values({
    conversationId,
    direction: "inbound",
    content: messageText,
    externalMessageId: msg.id,
    status: "delivered",
  });

  const conv = conversation.length > 0 ? conversation[0] : { aiStatus: "auto" };
  if (conv.aiStatus === "auto") {
    await triggerWhatsAppAutoReply(account, conversationId, senderId, messageText);
  }
}

async function triggerAutoReply(
  account: any,
  conversationId: number,
  recipientId: string,
  incomingMessage: string,
  platform: string
): Promise<void> {
  try {
    const recentMsgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(10);

    const formattedMsgs = recentMsgs.map(m => ({
      direction: m.direction || "inbound",
      content: m.content || ""
    }));

    const aiReply = await generateAIReply(incomingMessage, formattedMsgs, account.userId, "professional", conversationId);
    
    const accessToken = account.pageAccessToken || account.accessToken;
    const apiUrl = platform === "instagram" 
      ? `https://graph.facebook.com/v18.0/me/messages`
      : `https://graph.facebook.com/v18.0/me/messages`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text: aiReply },
        access_token: accessToken,
      }),
    });

    const result = await response.json() as { message_id?: string };

    await db.insert(messages).values({
      conversationId,
      direction: "outbound",
      content: aiReply,
      externalMessageId: result.message_id,
      status: "sent",
      isAiGenerated: true,
    });
  } catch (error) {
    console.error("Auto-reply failed:", error);
  }
}

async function triggerWhatsAppAutoReply(
  account: any,
  conversationId: number,
  recipientPhone: string,
  incomingMessage: string
): Promise<void> {
  try {
    const recentMsgs = await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(10);

    const formattedMsgs = recentMsgs.map(m => ({
      direction: m.direction || "inbound",
      content: m.content || ""
    }));

    const aiReply = await generateAIReply(incomingMessage, formattedMsgs, account.userId, "professional", conversationId);
    
    const phoneNumberId = account.platformAccountId;
    const accessToken = account.accessToken;

    const response = await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipientPhone,
          type: "text",
          text: { body: aiReply },
        }),
      }
    );

    const result = await response.json() as { messages?: Array<{ id: string }> };

    await db.insert(messages).values({
      conversationId,
      direction: "outbound",
      content: aiReply,
      externalMessageId: result.messages?.[0]?.id,
      status: "sent",
      isAiGenerated: true,
    });
  } catch (error) {
    console.error("WhatsApp auto-reply failed:", error);
  }
}
