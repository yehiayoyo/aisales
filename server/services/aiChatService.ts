import { db } from "../db.js";
import { aiChats, aiChatMessages } from "../../shared/models/aiChat.js";
import { eq, and, desc } from "drizzle-orm";
import {
  getProvider,
  getConfiguredProviders,
  type AIMessage,
  type GenerateOptions,
} from "./aiProviders/index.js";

export interface ChatMessage {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  type: "text" | "image" | "video" | "search";
  providerId?: string;
  model?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface Chat {
  id: number;
  userId: string;
  title: string;
  providerId: string;
  model?: string;
  createdAt: Date;
  updatedAt: Date;
}

export async function createChat(
  userId: string,
  providerId: string,
  model?: string,
  title?: string
): Promise<Chat> {
  const [chat] = await db
    .insert(aiChats)
    .values({
      userId,
      providerId,
      model,
      title: title || "New Chat",
    })
    .returning();

  return chat as Chat;
}

export async function getChat(chatId: number, userId: string): Promise<Chat | null> {
  const [chat] = await db
    .select()
    .from(aiChats)
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));

  return (chat as Chat) || null;
}

export async function getUserChats(userId: string, limit: number = 50): Promise<Chat[]> {
  const chats = await db
    .select()
    .from(aiChats)
    .where(eq(aiChats.userId, userId))
    .orderBy(desc(aiChats.updatedAt))
    .limit(limit);

  return chats as Chat[];
}

export async function deleteChat(chatId: number, userId: string): Promise<boolean> {
  const [chat] = await db
    .select()
    .from(aiChats)
    .where(and(eq(aiChats.id, chatId), eq(aiChats.userId, userId)));

  if (!chat) return false;

  await db.delete(aiChatMessages).where(eq(aiChatMessages.chatId, chatId));
  await db.delete(aiChats).where(eq(aiChats.id, chatId));

  return true;
}

export async function getChatMessages(chatId: number): Promise<ChatMessage[]> {
  const messages = await db
    .select()
    .from(aiChatMessages)
    .where(eq(aiChatMessages.chatId, chatId))
    .orderBy(aiChatMessages.createdAt);

  return messages as ChatMessage[];
}

export async function addMessage(
  chatId: number,
  role: "user" | "assistant",
  content: string,
  type: "text" | "image" | "video" | "search" = "text",
  providerId?: string,
  model?: string,
  metadata?: Record<string, any>
): Promise<ChatMessage> {
  const [message] = await db
    .insert(aiChatMessages)
    .values({
      chatId,
      role,
      content,
      type,
      providerId,
      model,
      metadata: metadata || null,
    })
    .returning();

  await db
    .update(aiChats)
    .set({ updatedAt: new Date() })
    .where(eq(aiChats.id, chatId));

  return message as ChatMessage;
}

export async function updateChatTitle(chatId: number, title: string): Promise<void> {
  await db.update(aiChats).set({ title }).where(eq(aiChats.id, chatId));
}

export async function sendMessage(
  chatId: number,
  userId: string,
  content: string,
  providerId: string,
  options: GenerateOptions = {}
): Promise<{ userMessage: ChatMessage; assistantMessage: ChatMessage }> {
  const chat = await getChat(chatId, userId);
  if (!chat) {
    throw new Error("Chat not found");
  }

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`Provider '${providerId}' not found`);
  }

  if (!provider.isConfigured()) {
    throw new Error(`Provider '${provider.name}' is not configured`);
  }

  const userMessage = await addMessage(chatId, "user", content, "text");

  const existingMessages = await getChatMessages(chatId);
  const contextMessages: AIMessage[] = existingMessages.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
    type: m.type,
  }));

  const response = await provider.generate(contextMessages, {
    ...options,
    model: options.model || chat.model,
  });

  if (response.error) {
    const errorMessage = await addMessage(
      chatId,
      "assistant",
      `Error: ${response.error}`,
      "text",
      providerId,
      options.model
    );
    return { userMessage, assistantMessage: errorMessage };
  }

  const assistantMessage = await addMessage(
    chatId,
    "assistant",
    response.content,
    response.type,
    providerId,
    options.model,
    response.metadata
  );

  if (existingMessages.length <= 1) {
    const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
    await updateChatTitle(chatId, title);
  }

  return { userMessage, assistantMessage };
}

export function getAvailableProviders() {
  return getConfiguredProviders().map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    icon: p.icon,
    capabilities: p.capabilities,
    models: p.models,
  }));
}
