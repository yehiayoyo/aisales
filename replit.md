# MT Hub - AI-Powered Business Automation Platform

## Overview
MT Hub is a production-grade SaaS platform designed to help businesses manage AI automation, social media, and customer communication from one centralized dashboard. The platform serves as a central AI brain controlling business communication across Facebook, Instagram, and WhatsApp.

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
│   │   ├── dashboard.ts         # Dashboard stats & settings
│   │   └── webhooks.ts          # Meta platform webhooks (Facebook/Instagram/WhatsApp)
│   ├── services/
│   │   ├── aiService.ts         # Central AI service with memory & tone profiles
│   │   └── encryptionService.ts # Token encryption service
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
- **AI:** OpenAI via Replit AI Integrations (supports any OpenAI-compatible provider)
- **Frontend:** HTML + Tailwind CSS
- **Security:** AES-256-GCM token encryption

## Features Implemented

### Core Features
1. **User Authentication** - Sign in with Google, GitHub, Apple, or email via Replit Auth
2. **Social Media Connection** - OAuth integration for Facebook Pages and Instagram Business
3. **WhatsApp Business** - Cloud API integration (sandbox support)
4. **Unified Inbox** - View all conversations from all platforms in one place
5. **AI Auto-Replies** - Context-aware responses with conversation memory
6. **Content Generation** - AI-powered post, caption, and ad copy creation
7. **Dashboard Analytics** - Stats on connected accounts, messages, and posts
8. **Manual Override** - Toggle AI on/off per conversation from dashboard

### AI Layer Features
- **Conversation Memory** - Maintains context across multiple messages
- **Tone Profiles** - Professional, Friendly, Sales-Focused, Support modes
- **Sentiment Analysis** - Analyzes customer message sentiment
- **Multi-Provider Support** - Works with any OpenAI-compatible LLM

### Security Features
- No secrets in code - All credentials via environment variables
- Token encryption at rest (AES-256-GCM)
- Session-validated OAuth callbacks
- Webhook signature verification

## Environment Variables

### Required for Facebook/Instagram
- `FACEBOOK_APP_ID` - Your Meta App ID
- `FACEBOOK_APP_SECRET` - Your Meta App Secret
- `META_WEBHOOK_VERIFY_TOKEN` - Webhook verification token (default: mt_hub_verify_token)

### Optional (for enhanced security)
- `TOKEN_ENCRYPTION_KEY` - 64-character hex string for token encryption

### Auto-configured by Replit
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
- `GET /api/ai/tone-profiles` - Get available tone profiles
- `POST /api/ai/clear-memory` - Clear conversation memory

### Dashboard
- `GET /api/dashboard/stats` - Get overview statistics
- `GET /api/dashboard/recent-conversations` - Get recent conversations
- `GET /api/auto-reply/rules` - Get auto-reply rules
- `POST /api/auto-reply/rules` - Create auto-reply rule
- `GET /api/scheduled-posts` - Get scheduled posts
- `POST /api/scheduled-posts` - Schedule new post

### Webhooks
- `GET /webhooks/meta` - Meta webhook verification
- `POST /webhooks/meta` - Meta message webhook handler
- `GET /webhooks/whatsapp` - WhatsApp webhook verification
- `POST /webhooks/whatsapp` - WhatsApp message webhook handler

### UGC System
- `POST /api/ugc/creator/profile` - Create/update creator profile
- `GET /api/ugc/creator/profile` - Get creator profile
- `GET /api/ugc/creators` - Search creators (with filters)
- `POST /api/ugc/campaigns` - Create UGC campaign
- `GET /api/ugc/campaigns` - List campaigns (brand or creator)
- `GET /api/ugc/campaigns/:id` - Get campaign details
- `POST /api/ugc/campaigns/:id/generate-brief` - Generate AI brief
- `POST /api/ugc/campaigns/:id/assign` - Assign creator to campaign
- `POST /api/ugc/assignments/:id/accept` - Creator accepts assignment
- `POST /api/ugc/assignments/:id/accept-nda` - Creator accepts NDA
- `POST /api/ugc/assignments/:id/submit` - Submit content
- `POST /api/ugc/submissions/:id/review` - Brand reviews submission
- `GET /api/ugc/submissions/:id/download` - Download approved content (protected)
- `GET /api/ugc/dashboard/stats` - UGC dashboard statistics
- `GET /api/ugc/dashboard/creator-status` - Creator assignment status
- `GET /api/ugc/dashboard/review-history` - Review history
- `GET /api/ugc/dashboard/approved-library` - Approved content library

### UGC Orders & Delivery
- `POST /api/ugc/orders` - Create new order
- `GET /api/ugc/orders` - List orders (buyer or creator view)
- `GET /api/ugc/orders/:id` - Get order details with deliveries
- `POST /api/ugc/orders/:id/pay` - Process payment for order
- `POST /api/ugc/orders/:id/start` - Creator starts working on order
- `POST /api/ugc/orders/:id/deliver` - Creator delivers content
- `POST /api/ugc/orders/:id/approve` - Buyer approves delivery (completes order)
- `POST /api/ugc/orders/:id/revision` - Buyer requests revision
- `GET /api/ugc/orders/:id/chat` - Get order chat messages
- `POST /api/ugc/orders/:id/chat` - Send chat message

### UGC AI Services
- `POST /api/ugc/ai/generate-video` - Generate UGC video via LumaAI
- `GET /api/ugc/ai/luma-status` - Check LumaAI configuration status

## Webhook Configuration

### For Facebook/Instagram
1. Go to Meta Developer Console
2. Add Webhooks product to your app
3. Configure webhook URL: `https://your-app.replit.app/webhooks/meta`
4. Set verify token to match `META_WEBHOOK_VERIFY_TOKEN`
5. Subscribe to: messages, messaging_postbacks

### For WhatsApp Business
1. Set up WhatsApp Business Cloud API
2. Configure webhook URL: `https://your-app.replit.app/webhooks/whatsapp`
3. Subscribe to: messages

## Recent Changes
- January 2026: Full production-grade rebuild
- Added Meta webhooks for real-time message sync (Facebook/Instagram/WhatsApp)
- Implemented central AI service with conversation memory and 4 tone profiles
- Added AES-256-GCM token encryption service for secure credential storage
- Built WhatsApp Business Cloud API integration (sandbox support)
- Created auto-reply automation with manual override toggle per conversation
- Enhanced security: webhook signature verification with raw body capture, OAuth requires authentication
- Isolated webhook router mounted before JSON parser for proper HMAC verification
- Added UGC Creator & Brand Collaboration System with full workflow lifecycle
- UGC AI capabilities: brief generation, script writing, hook suggestions, quality analysis
- UGC Content Protection: Downloads locked until final approval, watermark support, NDA acknowledgment
- Enhanced UGC Dashboard: 4 sections (Campaigns, Creator Status, Review History, Approved Content Library)
- Usage Rights Tracking: Platform, duration, exclusivity, territory metadata per submission
- **January 5, 2026**: Added UGC Order Management System with full payment workflow
- Order state machine: unpaid → paid → in_progress → delivered → completed
- Delivery workflow with video submission, approval, and revision cycles
- Revision limits tracking per assignment (default 3 revisions)
- Order-scoped chat system with sender roles (buyer/creator)
- LumaAI video generation service integration for AI-powered UGC creation
- Dashboard Orders section with chat modal and action buttons

## Architecture Notes
- Webhook router uses express.raw() and is mounted BEFORE express.json() for proper signature verification
- Conversation memory is scoped per conversationId to maintain separate context per thread
- TOKEN_ENCRYPTION_KEY environment variable is required (64-character hex string)
- AI auto-reply triggers when conversation aiStatus is "auto", can be toggled to "manual" for human override

## Multi-AI Chat System (Poe-like Interface)

### Overview
A modular multi-AI chat interface supporting multiple AI providers in one unified chat experience.

### Providers
- **ChatGPT (OpenAI)**: Text generation and conversation (gpt-4o, gpt-4o-mini, o1-preview)
- **Luma AI**: Image generation (photon-1) and video generation (ray-2)
- **Tavily Search**: Real-time web search with source citations

### Architecture
```
server/services/aiProviders/
├── index.ts           # Provider registry and interface definitions
├── openaiProvider.ts  # OpenAI/ChatGPT implementation
├── lumaProvider.ts    # Luma image/video generation
└── tavilyProvider.ts  # Web search integration

server/services/aiChatService.ts  # Chat persistence and messaging
server/routes/aiChat.ts           # REST API endpoints
shared/models/aiChat.ts           # Database schema (ai_chats, ai_chat_messages)
public/ai-chat.html               # Frontend UI
```

### Adding New Providers
1. Create a new file in `server/services/aiProviders/`
2. Implement the `AIProvider` interface
3. Register in `server/services/aiProviders/index.ts`

### API Endpoints
- `GET /api/ai-chat/providers` - List available AI providers
- `GET /api/ai-chat/chats` - List user's chats
- `POST /api/ai-chat/chats` - Create new chat
- `GET /api/ai-chat/chats/:id` - Get chat with messages
- `DELETE /api/ai-chat/chats/:id` - Delete chat
- `POST /api/ai-chat/chats/:id/messages` - Send message
- `POST /api/ai-chat/quick` - Quick one-off chat

### Access
Navigate to `/ai-chat` from the dashboard to use the multi-AI chat interface.
