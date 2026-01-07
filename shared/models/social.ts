import { sql, relations } from "drizzle-orm";
import { pgTable, varchar, timestamp, text, boolean, jsonb, serial, integer, numeric } from "drizzle-orm/pg-core";
import { users } from "./auth";

export const socialAccounts = pgTable("social_accounts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  platform: varchar("platform", { length: 50 }).notNull(),
  platformAccountId: varchar("platform_account_id").notNull(),
  accountName: varchar("account_name"),
  accountType: varchar("account_type", { length: 50 }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  pageAccessToken: text("page_access_token"),
  permissions: jsonb("permissions").$type<string[]>(),
  metadata: jsonb("metadata"),
  isActive: boolean("is_active").default(true),
  aiAutoReplyEnabled: boolean("ai_auto_reply_enabled").default(true),
  autoPostingEnabled: boolean("auto_posting_enabled").default(true),
  defaultTone: varchar("default_tone", { length: 20 }).default("professional"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const socialAccountsRelations = relations(socialAccounts, ({ one }) => ({
  user: one(users, {
    fields: [socialAccounts.userId],
    references: [users.id],
  }),
}));

export const autoReplyRules = pgTable("auto_reply_rules", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  socialAccountId: serial("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  isEnabled: boolean("is_enabled").default(true),
  mode: varchar("mode", { length: 20 }).default("ai_suggested"),
  triggerKeywords: jsonb("trigger_keywords").$type<string[]>(),
  responseTemplate: text("response_template"),
  aiPrompt: text("ai_prompt"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const scheduledPosts = pgTable("scheduled_posts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  socialAccountId: serial("social_account_id").references(() => socialAccounts.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  mediaUrls: jsonb("media_urls").$type<string[]>(),
  scheduledFor: timestamp("scheduled_for").notNull(),
  status: varchar("status", { length: 20 }).default("pending"),
  publishedAt: timestamp("published_at"),
  platformPostId: varchar("platform_post_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Business Profile for each social account (for AI context)
export const businessProfiles = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  socialAccountId: integer("social_account_id").notNull().references(() => socialAccounts.id, { onDelete: "cascade" }),
  businessName: varchar("business_name"),
  businessCategory: varchar("business_category", { length: 100 }),
  businessType: varchar("business_type", { length: 50 }), // "product" or "service"
  description: text("description"),
  paymentMethods: jsonb("payment_methods").$type<string[]>(),
  shippingInfo: text("shipping_info"),
  workingHours: text("working_hours"),
  contactInfo: text("contact_info"),
  customPrompt: text("custom_prompt"), // Additional AI instructions
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Products/Services catalog for AI to reference
export const businessProducts = pgTable("business_products", {
  id: serial("id").primaryKey(),
  businessProfileId: integer("business_profile_id").notNull().references(() => businessProfiles.id, { onDelete: "cascade" }),
  name: varchar("name").notNull(),
  type: varchar("type", { length: 50 }), // "product" or "service"
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 10 }).default("USD"),
  features: jsonb("features").$type<string[]>(),
  availability: varchar("availability", { length: 50 }).default("in_stock"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const businessProfilesRelations = relations(businessProfiles, ({ one, many }) => ({
  socialAccount: one(socialAccounts, {
    fields: [businessProfiles.socialAccountId],
    references: [socialAccounts.id],
  }),
  products: many(businessProducts),
}));

export const businessProductsRelations = relations(businessProducts, ({ one }) => ({
  businessProfile: one(businessProfiles, {
    fields: [businessProducts.businessProfileId],
    references: [businessProfiles.id],
  }),
}));

export type SocialAccount = typeof socialAccounts.$inferSelect;
export type InsertSocialAccount = typeof socialAccounts.$inferInsert;
export type AutoReplyRule = typeof autoReplyRules.$inferSelect;
export type InsertAutoReplyRule = typeof autoReplyRules.$inferInsert;
export type ScheduledPost = typeof scheduledPosts.$inferSelect;
export type InsertScheduledPost = typeof scheduledPosts.$inferInsert;
export type BusinessProfile = typeof businessProfiles.$inferSelect;
export type InsertBusinessProfile = typeof businessProfiles.$inferInsert;
export type BusinessProduct = typeof businessProducts.$inferSelect;
export type InsertBusinessProduct = typeof businessProducts.$inferInsert;
