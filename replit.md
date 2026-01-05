# AI Sales Project

## Overview
An AI-powered sales agent application that helps users find and purchase products. The app uses OpenAI GPT models to provide intelligent product recommendations and handle sales conversations.

## Project Structure
- `index.js` - Main Express server with API routes and OpenAI integration
- `index.html` - Chat interface for customers
- `dashboard.html` - Admin dashboard for product management
- `dashboard.js` - Dashboard frontend logic
- `data.js` - Data utilities
- `productsStore.js` - Product storage utilities
- `products.json` - Product data storage
- `sales_memory.json` - Sales conversation memory
- `uploads/products/` - Product images directory

## Tech Stack
- Node.js with Express
- OpenAI GPT (using Replit AI Integrations)
- Multer for file uploads

## Environment Variables
Uses Replit AI Integrations for OpenAI:
- `AI_INTEGRATIONS_OPENAI_API_KEY` - Auto-configured by Replit
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - Auto-configured by Replit

## Running the App
The server runs on port 5000. Use `npm start` to launch.

## Recent Changes
- January 2026: Imported from GitHub
- Configured for Replit environment (port 5000, 0.0.0.0 host)
- Integrated with Replit AI Integrations for OpenAI access
