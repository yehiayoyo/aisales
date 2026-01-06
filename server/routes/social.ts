import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../replit_integrations/auth/index.js";
import { db } from "../db.js";
import { socialAccounts, autoReplyRules } from "../../shared/schema.js";
import { eq, and } from "drizzle-orm";

export function registerSocialRoutes(app: Express): void {
  app.get("/api/social/accounts", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accounts = await db.select().from(socialAccounts).where(eq(socialAccounts.userId, userId));
      res.json(accounts);
    } catch (error) {
      console.error("Error fetching social accounts:", error);
      res.status(500).json({ error: "Failed to fetch accounts" });
    }
  });

  app.get("/api/social/connect/facebook", isAuthenticated, async (req: any, res: Response) => {
    const fbAppId = process.env.FACEBOOK_APP_ID;
    const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
    const redirectUri = `https://${domain}/api/social/callback/facebook`;
    // Basic scopes that work in development mode without App Review
    const scope = "public_profile,email";
    
    console.log("Facebook OAuth - Starting connection");
    console.log("Facebook OAuth - App ID:", fbAppId ? "SET" : "NOT SET");
    console.log("Facebook OAuth - Redirect URI:", redirectUri);
    
    if (!fbAppId) {
      return res.status(500).json({ error: "Facebook App not configured. Please add FACEBOOK_APP_ID secret." });
    }
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${req.user.claims.sub}`;
    console.log("Facebook OAuth - Redirecting to:", authUrl);
    res.redirect(authUrl);
  });

  app.get("/api/social/callback/facebook", async (req: any, res: Response) => {
    console.log("Facebook OAuth - Callback received");
    console.log("Facebook OAuth - Query params:", JSON.stringify(req.query));
    
    const { code, error: oauthError, error_reason, error_description, state } = req.query;
    
    // Use state parameter as userId (passed during OAuth initiation)
    const userId = state as string;
    
    if (!userId) {
      console.error("Facebook OAuth - No state/userId in callback");
      return res.redirect("/app?error=invalid_state");
    }
    
    if (oauthError || !code) {
      console.error("Facebook OAuth denied:", oauthError, error_reason, error_description);
      return res.redirect(`/app?error=oauth_denied&reason=${encodeURIComponent(error_description || oauthError || 'unknown')}`);
    }
    
    try {
      const fbAppId = process.env.FACEBOOK_APP_ID;
      const fbAppSecret = process.env.FACEBOOK_APP_SECRET;
      const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
      const redirectUri = `https://${domain}/api/social/callback/facebook`;
      
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${fbAppSecret}&code=${code}`
      );
      const tokenData = await tokenResponse.json() as { access_token?: string; error?: any };
      
      if (!tokenData.access_token) {
        console.error("Facebook token error:", tokenData);
        return res.redirect("/app?error=token_failed");
      }
      
      // Get user profile
      const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${tokenData.access_token}&fields=id,name,email`);
      const userData = await userResponse.json() as { id: string; name: string; email?: string };
      
      // Try to get pages (may fail without business verification)
      let pagesData: { data?: Array<{ id: string; name: string; access_token: string; category: string }> } = { data: [] };
      try {
        const pagesResponse = await fetch(`https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}&fields=id,name,access_token,category`);
        pagesData = await pagesResponse.json();
      } catch (e) {
        console.log("Could not fetch pages (may require business verification)");
      }
      
      if (pagesData.data && pagesData.data.length > 0) {
        // Save connected pages with AI features auto-enabled
        for (const page of pagesData.data) {
          const existing = await db.select().from(socialAccounts).where(
            and(
              eq(socialAccounts.userId, userId),
              eq(socialAccounts.platformAccountId, page.id)
            )
          );
          
          let accountId: number;
          if (existing.length === 0) {
            const [newAccount] = await db.insert(socialAccounts).values({
              userId: userId,
              platform: "facebook",
              platformAccountId: page.id,
              accountName: page.name,
              accountType: page.category || "Page",
              accessToken: tokenData.access_token,
              pageAccessToken: page.access_token,
              permissions: ["public_profile", "email"],
              isActive: true,
              aiAutoReplyEnabled: true,
              autoPostingEnabled: true,
              defaultTone: "professional",
            }).returning();
            accountId = newAccount.id;
            
            // Auto-create default AI auto-reply rule
            await db.insert(autoReplyRules).values({
              userId: userId,
              socialAccountId: accountId,
              name: `Smart Reply - ${page.name}`,
              isEnabled: true,
              mode: "ai_suggested",
              aiPrompt: "You are a helpful business assistant. Respond professionally and helpfully to customer inquiries. Be friendly and try to assist with their questions or direct them appropriately.",
            });
          } else {
            accountId = existing[0].id;
            await db.update(socialAccounts)
              .set({
                accessToken: tokenData.access_token,
                pageAccessToken: page.access_token,
                aiAutoReplyEnabled: true,
                autoPostingEnabled: true,
                updatedAt: new Date(),
              })
              .where(eq(socialAccounts.id, accountId));
          }
        }
      } else {
        // Save user's Facebook profile if no pages available
        const existing = await db.select().from(socialAccounts).where(
          and(
            eq(socialAccounts.userId, userId),
            eq(socialAccounts.platformAccountId, userData.id)
          )
        );
        
        let accountId: number;
        if (existing.length === 0) {
          const [newAccount] = await db.insert(socialAccounts).values({
            userId: userId,
            platform: "facebook",
            platformAccountId: userData.id,
            accountName: userData.name,
            accountType: "Profile",
            accessToken: tokenData.access_token,
            permissions: ["public_profile", "email"],
            isActive: true,
            aiAutoReplyEnabled: true,
            autoPostingEnabled: true,
            defaultTone: "professional",
          }).returning();
          accountId = newAccount.id;
          
          // Auto-create default AI auto-reply rule
          await db.insert(autoReplyRules).values({
            userId: userId,
            socialAccountId: accountId,
            name: `Smart Reply - ${userData.name}`,
            isEnabled: true,
            mode: "ai_suggested",
            aiPrompt: "You are a helpful business assistant. Respond professionally and helpfully to customer inquiries. Be friendly and try to assist with their questions or direct them appropriately.",
          });
        } else {
          await db.update(socialAccounts)
            .set({
              accessToken: tokenData.access_token,
              aiAutoReplyEnabled: true,
              autoPostingEnabled: true,
              updatedAt: new Date(),
            })
            .where(eq(socialAccounts.id, existing[0].id));
        }
      }
      
      res.redirect("/app?success=connected");
    } catch (error) {
      console.error("Facebook OAuth error:", error);
      res.redirect("/app?error=oauth_error");
    }
  });

  app.delete("/api/social/accounts/:id", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const accountId = parseInt(req.params.id);
      
      await db.delete(socialAccounts).where(
        and(
          eq(socialAccounts.id, accountId),
          eq(socialAccounts.userId, userId)
        )
      );
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });
}
