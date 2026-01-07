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

  // Facebook Login - uses FACEBOOK_LOGIN_APP_ID for authentication
  app.get("/api/social/connect/facebook", isAuthenticated, async (req: any, res: Response) => {
    // Use dedicated login app, fallback to main app
    const fbAppId = process.env.FACEBOOK_LOGIN_APP_ID || process.env.FACEBOOK_APP_ID;
    const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
    const redirectUri = `https://${domain}/api/social/callback/facebook`;
    // Use only public_profile (email requires Advanced Access)
    const scope = "public_profile";
    
    console.log("Facebook OAuth - Starting connection (Login App)");
    console.log("Facebook OAuth - Redirect URI:", redirectUri);
    
    if (!fbAppId) {
      return res.status(500).json({ error: "Facebook App not configured. Please add FACEBOOK_LOGIN_APP_ID or FACEBOOK_APP_ID secret." });
    }
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${req.user.claims.sub}`;
    
    res.json({ authUrl });
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
      // Use dedicated login app, fallback to main app
      const fbAppId = process.env.FACEBOOK_LOGIN_APP_ID || process.env.FACEBOOK_APP_ID;
      const fbAppSecret = process.env.FACEBOOK_LOGIN_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
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
      
      // Save ONLY the user's Facebook profile - pages will be selected manually via modal
      const existing = await db.select().from(socialAccounts).where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platformAccountId, userData.id)
        )
      );
      
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
        
        // Auto-create default AI auto-reply rule for the profile
        await db.insert(autoReplyRules).values({
          userId: userId,
          socialAccountId: newAccount.id,
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
      
      res.redirect("/app?success=connected");
    } catch (error) {
      console.error("Facebook OAuth error:", error);
      res.redirect("/app?error=oauth_error");
    }
  });

  // Start OAuth flow for Facebook Pages using the Pages App (separate from login)
  app.get("/api/social/connect/facebook-pages", isAuthenticated, async (req: any, res: Response) => {
    // Use dedicated pages app (FACEBOOK_APP_ID for pages management)
    const fbAppId = process.env.FACEBOOK_APP_ID;
    const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
    const redirectUri = `https://${domain}/api/social/callback/facebook-pages`;
    // Request pages permissions
    const scope = "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata";
    
    console.log("Facebook Pages OAuth - Starting connection (Pages App)");
    console.log("Facebook Pages OAuth - Using App ID:", fbAppId);
    console.log("Facebook Pages OAuth - Redirect URI:", redirectUri);
    
    if (!fbAppId) {
      return res.status(500).json({ error: "Facebook Pages App not configured. Please add FACEBOOK_APP_ID secret." });
    }
    
    const authUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code&state=${req.user.claims.sub}`;
    
    res.json({ authUrl });
  });

  // Callback for Facebook Pages OAuth
  app.get("/api/social/callback/facebook-pages", async (req: any, res: Response) => {
    console.log("Facebook Pages OAuth - Callback received");
    
    const { code, error: oauthError, error_description, state } = req.query;
    const userId = state as string;
    
    if (!userId) {
      return res.redirect("/app?error=invalid_state");
    }
    
    if (oauthError || !code) {
      console.error("Facebook Pages OAuth denied:", oauthError, error_description);
      return res.redirect(`/app?error=oauth_denied&reason=${encodeURIComponent(error_description || oauthError || 'unknown')}`);
    }
    
    try {
      // Use Pages App credentials
      const fbAppId = process.env.FACEBOOK_APP_ID;
      const fbAppSecret = process.env.FACEBOOK_APP_SECRET;
      const domain = process.env.REPLIT_DEV_DOMAIN || req.hostname;
      const redirectUri = `https://${domain}/api/social/callback/facebook-pages`;
      
      // Exchange code for token
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${fbAppId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${fbAppSecret}&code=${code}`
      );
      const tokenData = await tokenResponse.json() as { access_token?: string; error?: any };
      
      if (!tokenData.access_token) {
        console.error("Facebook Pages token error:", tokenData);
        return res.redirect("/app?error=token_failed");
      }
      
      // Save or update Pages token for this user
      const existing = await db.select().from(socialAccounts).where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, "facebook"),
          eq(socialAccounts.accountType, "PagesToken")
        )
      );
      
      if (existing.length === 0) {
        await db.insert(socialAccounts).values({
          userId: userId,
          platform: "facebook",
          platformAccountId: `pages_token_${userId}`,
          accountName: "Facebook Pages Access",
          accountType: "PagesToken",
          accessToken: tokenData.access_token,
          aiAutoReplyEnabled: false,
          autoPostingEnabled: false,
        });
      } else {
        await db.update(socialAccounts)
          .set({ accessToken: tokenData.access_token, updatedAt: new Date() })
          .where(eq(socialAccounts.id, existing[0].id));
      }
      
      res.redirect("/app?success=pages_connected");
    } catch (error) {
      console.error("Facebook Pages OAuth error:", error);
      res.redirect("/app?error=oauth_error");
    }
  });

  // Fetch Facebook Pages for the connected profile (tokens kept server-side for security)
  app.get("/api/social/facebook/pages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get the user's Facebook accounts
      const accounts = await db.select().from(socialAccounts).where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, "facebook")
        )
      );
      
      if (accounts.length === 0) {
        return res.status(404).json({ error: "No Facebook account connected. Please connect your Facebook first." });
      }
      
      // First check for PagesToken (from second app), then fall back to Profile token
      const pagesTokenAccount = accounts.find(a => a.accountType === "PagesToken");
      const profileAccount = accounts.find(a => a.accountType === "Profile");
      
      // Use PagesToken if available (from Pages App), otherwise use Profile token
      const tokenAccount = pagesTokenAccount || profileAccount || accounts[0];
      const accessToken = tokenAccount.accessToken;
      
      if (!accessToken) {
        return res.status(400).json({ error: "No access token available. Please reconnect your Facebook." });
      }
      
      // Fetch pages from Facebook Graph API
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}&fields=id,name,category,picture{url}`
      );
      const pagesData = await pagesResponse.json() as { 
        data?: Array<{ id: string; name: string; category: string; picture?: { data?: { url?: string } } }>;
        error?: { message: string };
      };
      
      if (pagesData.error) {
        console.error("Facebook Pages API error:", pagesData.error);
        return res.status(400).json({ error: pagesData.error.message || "Failed to fetch pages" });
      }
      
      const pages = pagesData.data || [];
      
      // Check which pages are already connected
      const connectedPageIds = accounts
        .filter(a => a.accountType !== "Profile")
        .map(a => a.platformAccountId);
      
      // Return page info WITHOUT access tokens (security)
      const pagesWithStatus = pages.map(page => ({
        id: page.id,
        name: page.name,
        category: page.category,
        picture: page.picture?.data?.url || null,
        isConnected: connectedPageIds.includes(page.id)
      }));
      
      res.json({ 
        pages: pagesWithStatus,
        profileConnected: true,
        profileName: profileAccount?.accountName || tokenAccount.accountName,
        hasPagesToken: !!pagesTokenAccount
      });
    } catch (error) {
      console.error("Error fetching Facebook pages:", error);
      res.status(500).json({ error: "Failed to fetch Facebook pages" });
    }
  });

  // Connect a specific Facebook Page (fetches token server-side for security)
  app.post("/api/social/facebook/pages", isAuthenticated, async (req: any, res: Response) => {
    try {
      const userId = req.user.claims.sub;
      const { pageId } = req.body;
      
      if (!pageId) {
        return res.status(400).json({ error: "Missing page ID" });
      }
      
      // Get the user's accounts to retrieve the access token
      const accounts = await db.select().from(socialAccounts).where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, "facebook")
        )
      );
      
      // Use PagesToken first (from Pages App), then fall back to Profile token
      const pagesTokenAccount = accounts.find(a => a.accountType === "PagesToken");
      const profileAccount = accounts.find(a => a.accountType === "Profile");
      const tokenAccount = pagesTokenAccount || profileAccount;
      
      if (!tokenAccount || !tokenAccount.accessToken) {
        return res.status(400).json({ error: "Facebook not connected. Please authorize Pages access first." });
      }
      
      // Fetch pages with access tokens from Facebook (server-side only)
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?access_token=${tokenAccount.accessToken}&fields=id,name,category,access_token,picture{url}`
      );
      const pagesData = await pagesResponse.json() as { 
        data?: Array<{ id: string; name: string; category: string; access_token: string; picture?: { data?: { url?: string } } }>;
        error?: { message: string };
      };
      
      if (pagesData.error) {
        return res.status(400).json({ error: pagesData.error.message || "Failed to fetch pages" });
      }
      
      // Find the requested page
      const page = pagesData.data?.find(p => p.id === pageId);
      if (!page) {
        return res.status(404).json({ error: "Page not found or you don't have access to it" });
      }
      
      // Check if already connected
      const existing = await db.select().from(socialAccounts).where(
        and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platformAccountId, pageId)
        )
      );
      
      let accountId: number;
      
      if (existing.length === 0) {
        // Create new page connection with server-fetched token
        const [newAccount] = await db.insert(socialAccounts).values({
          userId: userId,
          platform: "facebook",
          platformAccountId: page.id,
          accountName: page.name,
          accountType: page.category || "Page",
          pageAccessToken: page.access_token,
          permissions: ["pages_manage_posts", "pages_messaging", "pages_read_engagement"],
          isActive: true,
          aiAutoReplyEnabled: true,
          autoPostingEnabled: true,
          defaultTone: "professional",
          metadata: page.picture?.data?.url ? { picture: page.picture.data.url } : undefined,
        }).returning();
        accountId = newAccount.id;
        
        // Auto-create default AI auto-reply rule
        await db.insert(autoReplyRules).values({
          userId: userId,
          socialAccountId: accountId,
          name: `Smart Reply - ${page.name}`,
          isEnabled: true,
          mode: "ai_suggested",
          aiPrompt: "You are a helpful business assistant for this Facebook Page. Respond professionally and helpfully to customer inquiries. Be friendly and try to assist with their questions or direct them appropriately.",
        });
        
        res.json({ success: true, message: `Page "${page.name}" connected successfully!`, accountId });
      } else {
        // Update existing connection with fresh token
        await db.update(socialAccounts)
          .set({
            pageAccessToken: page.access_token,
            aiAutoReplyEnabled: true,
            autoPostingEnabled: true,
            updatedAt: new Date(),
          })
          .where(eq(socialAccounts.id, existing[0].id));
        
        res.json({ success: true, message: `Page "${page.name}" reconnected!`, accountId: existing[0].id });
      }
    } catch (error) {
      console.error("Error connecting Facebook page:", error);
      res.status(500).json({ error: "Failed to connect Facebook page" });
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
