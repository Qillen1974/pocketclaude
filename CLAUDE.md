# AI Helper (PocketClaude)

## Project Overview
Mobile relay system enabling remote access to Claude Code from any device via a cloud relay.

## Architecture
- **relay-server/**: WebSocket relay hosted on Railway
- **pc-agent/**: Windows agent running locally, manages Claude Code sessions
- **mobile-app/**: Next.js PWA for web/mobile access

## Key Decisions
- Single agent connection enforced by relay server
- Token-based authentication
- Auto-reconnect with exponential backoff
- 30-min idle session timeout

## Current Status
- Deployed and working
- Relay: pocketclaude-production.up.railway.app
- Web App: pocketclaude-production-834d.up.railway.app

## Session Notes
<!-- Claude: Add important discussion points and decisions here -->

