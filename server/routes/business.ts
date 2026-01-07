import { Express, Response } from "express";
import { db } from "../db";
import { businessProfiles, businessProducts, socialAccounts } from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { isAuthenticated } from "../replit_integrations/auth";

export function registerBusinessRoutes(app: Express) {
  // Get business profile for a social account
  app.get("/api/business/profile/:accountId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accountId = parseInt(req.params.accountId);
      
      // Verify ownership - user can only access their own accounts
      const account = await db.select().from(socialAccounts)
        .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)));
      
      if (account.length === 0) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const profiles = await db.select().from(businessProfiles)
        .where(eq(businessProfiles.socialAccountId, accountId));
      
      if (profiles.length === 0) {
        return res.json({ profile: null, products: [] });
      }
      
      const products = await db.select().from(businessProducts)
        .where(eq(businessProducts.businessProfileId, profiles[0].id));
      
      res.json({ profile: profiles[0], products });
    } catch (error) {
      console.error("Error fetching business profile:", error);
      res.status(500).json({ error: "Failed to fetch business profile" });
    }
  });

  // Create or update business profile
  app.post("/api/business/profile/:accountId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accountId = parseInt(req.params.accountId);
      const { businessName, businessCategory, businessType, description, paymentMethods, shippingInfo, workingHours, contactInfo, customPrompt } = req.body;
      
      // Verify ownership - user can only access their own accounts
      const account = await db.select().from(socialAccounts)
        .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)));
      
      if (account.length === 0) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check if profile exists
      const existing = await db.select().from(businessProfiles)
        .where(eq(businessProfiles.socialAccountId, accountId));
      
      if (existing.length > 0) {
        // Update
        await db.update(businessProfiles)
          .set({
            businessName,
            businessCategory,
            businessType,
            description,
            paymentMethods,
            shippingInfo,
            workingHours,
            contactInfo,
            customPrompt,
            updatedAt: new Date(),
          })
          .where(eq(businessProfiles.id, existing[0].id));
        
        res.json({ success: true, profileId: existing[0].id });
      } else {
        // Create
        const [profile] = await db.insert(businessProfiles).values({
          socialAccountId: accountId,
          businessName,
          businessCategory,
          businessType,
          description,
          paymentMethods,
          shippingInfo,
          workingHours,
          contactInfo,
          customPrompt,
        }).returning();
        
        res.json({ success: true, profileId: profile.id });
      }
    } catch (error) {
      console.error("Error saving business profile:", error);
      res.status(500).json({ error: "Failed to save business profile" });
    }
  });

  // Add product to business profile
  app.post("/api/business/profile/:accountId/products", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accountId = parseInt(req.params.accountId);
      const { name, type, description, price, currency, features, availability } = req.body;
      
      // Verify ownership - user can only access their own accounts
      const account = await db.select().from(socialAccounts)
        .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)));
      
      if (account.length === 0) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Get or create profile
      let profiles = await db.select().from(businessProfiles)
        .where(eq(businessProfiles.socialAccountId, accountId));
      
      let profileId: number;
      if (profiles.length === 0) {
        const [newProfile] = await db.insert(businessProfiles).values({
          socialAccountId: accountId,
        }).returning();
        profileId = newProfile.id;
      } else {
        profileId = profiles[0].id;
      }
      
      const [product] = await db.insert(businessProducts).values({
        businessProfileId: profileId,
        name,
        type,
        description,
        price: price ? price.toString() : null,
        currency: currency || "USD",
        features,
        availability: availability || "in_stock",
      }).returning();
      
      res.json({ success: true, product });
    } catch (error) {
      console.error("Error adding product:", error);
      res.status(500).json({ error: "Failed to add product" });
    }
  });

  // Update product
  app.patch("/api/business/products/:productId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.productId);
      const { name, type, description, price, currency, features, availability } = req.body;
      
      // Verify ownership through joins
      const product = await db.select({
        product: businessProducts,
        profile: businessProfiles,
        account: socialAccounts,
      })
      .from(businessProducts)
      .innerJoin(businessProfiles, eq(businessProducts.businessProfileId, businessProfiles.id))
      .innerJoin(socialAccounts, eq(businessProfiles.socialAccountId, socialAccounts.id))
      .where(and(
        eq(businessProducts.id, productId),
        eq(socialAccounts.userId, userId)
      ));
      
      if (product.length === 0) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      await db.update(businessProducts)
        .set({
          name,
          type,
          description,
          price: price ? price.toString() : null,
          currency,
          features,
          availability,
          updatedAt: new Date(),
        })
        .where(eq(businessProducts.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  // Delete product
  app.delete("/api/business/products/:productId", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const productId = parseInt(req.params.productId);
      
      // Verify ownership
      const product = await db.select({
        product: businessProducts,
        profile: businessProfiles,
        account: socialAccounts,
      })
      .from(businessProducts)
      .innerJoin(businessProfiles, eq(businessProducts.businessProfileId, businessProfiles.id))
      .innerJoin(socialAccounts, eq(businessProfiles.socialAccountId, socialAccounts.id))
      .where(and(
        eq(businessProducts.id, productId),
        eq(socialAccounts.userId, userId)
      ));
      
      if (product.length === 0) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      await db.delete(businessProducts).where(eq(businessProducts.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
}
