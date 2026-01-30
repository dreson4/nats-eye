# NATS Eye

A modern, self-hostable web UI for managing NATS clusters. Monitor your JetStream streams, KV stores, and cluster health in real-time.

> **100% Vibe Coded** - This entire codebase was written by Claude Code with my guidance and direction. I wrote zero lines of code, just provided requirements, feedback, and design decisions. Took a few hours. I expect you will self host this and run on your own machine. If anything doesn't work make a bug report or PR.

![NATS Eye Dashboard](https://img.shields.io/badge/status-beta-yellow)

## Features

- **Cluster Management** - Connect to multiple NATS clusters with support for token and username/password authentication
- **Dashboard** - Real-time overview of cluster health, connections, and message rates
- **JetStream Streams** - Browse, create, and manage streams with live message tailing
- **KV Store** - Full key-value store management with real-time key watching
- **Dark/Light Mode** - Clean, modern UI with theme support

## Quick Start with Docker

```bash
docker run -d \
  -p 3000:3000 \
  -v nats-eye-data:/app/data \
  --name nats-eye \
  ghcr.io/dreson4/nats-eye:latest
```

Then open http://localhost:3000 in your browser.

### Docker Compose

```yaml
services:
  nats-eye:
    image: ghcr.io/dreson4/nats-eye:latest
    ports:
      - "3000:3000"
    volumes:
      - nats-eye-data:/app/data
    restart: unless-stopped

volumes:
  nats-eye-data:
```

## Configuration

| Environment Variable | Default | Description                  |
| -------------------- | ------- | ---------------------------- |
| `PORT`               | `3000`  | Server port                  |
| `SECURE_COOKIES`     | `false` | Set to `true` if using HTTPS |

## First-Time Setup

1. Open NATS Eye in your browser
2. Create an admin account on the setup page
3. Add your first NATS cluster (use `ws://` or `wss://` WebSocket URLs)
4. Start monitoring!

## NATS Server Configuration

NATS Eye connects via WebSocket. Make sure your NATS server has WebSocket enabled:

```conf
# nats-server.conf
websocket {
  port: 8080
  no_tls: true  # Use TLS in production!
}
```

## Development

```bash
# Install dependencies
bun install

# Run development server (frontend + backend)
bun run dev

# Build for production
bun run build
```

## Tech Stack

- **Frontend**: React, TanStack Router/Query, Tailwind CSS, Shadcn UI
- **Backend**: Bun, Hono
- **Database**: SQLite (bun:sqlite)
- **NATS**: nats.ws (WebSocket client)

## License

MIT
