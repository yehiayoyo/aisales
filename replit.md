# MT Hub - AI-Powered Business Automation Platform

## Overview
MT Hub is a full-featured SaaS platform designed to help businesses manage AI automation, social media, and customer communication from one centralized dashboard. The platform integrates AI intelligence directly with social media pages and messaging platforms.

## Project Structure
```
/
├── server/                      # Backend TypeScript code
│   ├── index.ts                 # Main Express server entry
│   ├── db.ts                    # Database connection (Drizzle + PostgreSQL)
│   ├── routes/
│   │   ├── social.ts            # Social media OAuth & account management
│   │   ├── messaging.ts         # Unified inbox & conversations
│   │   ├── ai.ts                # AI reply generation & content creation
│   │   └── dashboard.ts         # Dashboard stats & settings
│   └── replit_integrations/
│       └── auth/                # Replit Auth integration
├── shared/                      # Shared schemas and types
│   ├── schema.ts                # Export all models
│   └── models/
│       ├── auth.ts              # User & session models
│       ├── social.ts            # Social accounts & auto-reply rules
│       └── messaging.ts         # Conversations & messages
├── public/                      # Frontend static files
│   ├── index.html               # Landing page
│   └── dashboard.html           # Main dashboard
├── drizzle.config.ts            # Drizzle ORM configuration
└── package.json                 # Dependencies & scripts
```

## Tech Stack
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL with Drizzle ORM
- **Authentication:** Replit Auth (OpenID Connect)
- **AI:** OpenAI via Replit AI Integrations
- **Frontend:** HTML + Tailwind CSS

## Features Implemented (MVP)
1. **User Authentication** - Sign in with Google, GitHub, Apple, or email via Replit Auth
2. **Social Media Connection** - OAuth integration for Facebook Pages
3. **Unified Inbox** - View all conversations in one place
4. **AI Auto-Replies** - Generate context-aware responses with OpenAI
5. **Content Generation** - AI-powered post, caption, and ad copy creation
6. **Dashboard Analytics** - Stats on connected accounts, messages, and posts

## Environment Variables
Required secrets for Facebook integration:
- `FACEBOOK_APP_ID` - Your Meta App ID
- `FACEBOOK_APP_SECRET` - Your Meta App Secret

Auto-configured by Replit:
- `DATABASE_URL` - PostgreSQL connection
- `SESSION_SECRET` - Session encryption
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI access
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI endpoint

## Running the App
```bash
npm run dev        # Development server with hot reload
npm run db:push    # Push schema changes to database
npm run db:studio  # Open Drizzle Studio for DB inspection
```

## API Endpoints
### Auth
- `GET /api/login` - Initiate login flow
- `GET /api/logout` - Logout user
- `GET /api/auth/user` - Get current user

### Social Accounts
- `GET /api/social/accounts` - List connected accounts
- `GET /api/social/connect/facebook` - Connect Facebook Page
- `DELETE /api/social/accounts/:id` - Disconnect account

### Messaging
- `GET /api/inbox` - Get all conversations
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations/:id/reply` - Send reply
- `POST /api/conversations/:id/ai-status` - Toggle AI mode

### AI
- `POST /api/ai/generate-reply` - Generate AI reply for message
- `POST /api/ai/generate-content` - Generate social media content
- `POST /api/ai/analyze-sentiment` - Analyze message sentiment

### Dashboard
- `GET /api/dashboard/stats` - Get overview statistics
- `GET /api/dashboard/recent-conversations` - Get recent conversations
- `GET /api/auto-reply/rules` - Get auto-reply rules
- `POST /api/auto-reply/rules` - Create auto-reply rule
- `GET /api/scheduled-posts` - Get scheduled posts
- `POST /api/scheduled-posts` - Schedule new post

## Next Steps (Future Features)
1. Instagram Business Account integration
2. WhatsApp Business Cloud API integration
3. Webhook handlers for real-time message sync
4. Post scheduling with cron jobs
5. Advanced analytics and reporting
6. Multi-user team management

## Recent Changes
- January 2026: Initial MT Hub platform build
- Implemented Replit Auth for user management
- Built Facebook OAuth integration
- Created unified dashboard with AI features
- Set up PostgreSQL database with proper schema
