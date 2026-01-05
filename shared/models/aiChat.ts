import { sql, relations } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, serial, integer, jsonb } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const aiChats = pgTable("ai_chats", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).default("New Chat"),
  providerId: varchar("provider_id", { length: 50 }).notNull(),
  model: varchar("model", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiChatMessages = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  chatId: integer("chat_id").notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  type: varchar("type", { length: 20 }).default("text"),
  providerId: varchar("provider_id", { length: 50 }),
  model: varchar("model", { length: 100 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiChatsRelations = relations(aiChats, ({ one, many }) => ({
  user: one(users, {
    fields: [aiChats.userId],
    references: [users.id],
  }),
  messages: many(aiChatMessages),
}));

export const aiChatMessagesRelations = relations(aiChatMessages, ({ one }) => ({
  chat: one(aiChats, {
    fields: [aiChatMessages.chatId],
    references: [aiChats.id],
  }),
}));

export type AiChat = typeof aiChats.$inferSelect;
export type InsertAiChat = typeof aiChats.$inferInsert;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;
export type InsertAiChatMessage = typeof aiChatMessages.$inferInsert;
