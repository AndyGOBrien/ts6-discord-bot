# ts6-discord-bot

A Discord bot that monitors a TeamSpeak server via the WebQuery API and displays the currently connected users in a Discord channel. The bot maintains a single, auto-updating embed showing who's online and sets its activity status to reflect the current user count.

> [!CAUTION]
> ONLY USE THIS IN A NEW EMPTY DISCORD CHANNEL
> This will delete the chat history of the discord channel it is assigned to

## Features

- **Live user list** — A single embed in a designated Discord channel shows all connected TeamSpeak users, updated every poll cycle.
- **Bot activity status** — Displays "Watching 3 users on TeamSpeak" (or similar) in the Discord member sidebar.
- **Read-only channel** — Automatically locks the status channel so only the bot can post.
- **Auto-purge** — Clears all existing messages in the channel on startup, leaving only the status embed.
- **Invite link** — Optionally includes a clickable "Join TeamSpeak" link in the embed with server password, channel ID, and channel password support.
- **Self-healing** — If the status message is deleted, the bot detects this and recreates it on the next poll.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `TS_API_BASE` | Yes | TeamSpeak WebQuery base URL (e.g. `http://localhost:10080/1`) |
| `TS_API_KEY` | Yes | TeamSpeak WebQuery API key |
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `STATUS_CHANNEL_ID` | Yes | Discord channel ID for the status embed |
| `POLL_INTERVAL` | No | Polling interval in ms (default: `5000`) |
| `TS_INVITE_LINK` | No | Base URL for the TeamSpeak invite link |
| `TS_SERVER_PASSWORD` | No | TeamSpeak server password (appended to invite link) |
| `TS_CHANNEL_ID` | No | Default channel ID to join (appended to invite link) |
| `TS_CHANNEL_PASSWORD` | No | Channel password (appended to invite link) |


## Docker

### Build and run locally

```bash
docker build -t ts6-discord-bot .
docker run -d --name ts6-discord-bot \
  -e TS_API_BASE=http://localhost:10080/1 \
  -e TS_API_KEY=your_api_key \
  -e DISCORD_TOKEN=your_discord_token \
  -e STATUS_CHANNEL_ID=your_channel_id \
  ts6-discord-bot
```

### Docker Compose

```yaml
services:
  ts6-discord-bot:
    image: ghcr.io/andygobrien/ts6-discord-bot:latest
    container_name: ts6-discord-bot
    restart: unless-stopped
    environment:
      # TeamSpeak
      - TS_API_BASE=http://localhost:10080/1
      - TS_API_KEY=your_api_key
      - POLL_INTERVAL=5000
      # http/https required for hyper link in discord, must use redirect to the teamspeak6://your-ts6-server-url.com for a proper hyperlink to appear in discord
      - TS_INVITE_LINK={base invite link} 
      - TS_SERVER_PASSWORD=your_server_password
      - TS_CHANNEL_ID=5
      - TS_CHANNEL_PASSWORD=your_channel_password
      # Discord
      - DISCORD_TOKEN=your_discord_token
      - STATUS_CHANNEL_ID=your_channel_id
```

## Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Under **Bot**, create a bot and copy the token.
3. Under **OAuth2 > URL Generator**, select the `bot` scope with these permissions:
   - Manage Channels
   - Send Messages
   - Manage Messages
   - Read Message History
   - View Channels
4. Use the generated URL to invite the bot to your server.
5. Create a text channel for the status embed and copy its channel ID.

## Optional: Caddy Reverse Proxy for Invite Links

If you want clean invite URLs (e.g. `https://yourdomain.com/ts?password=mypass`) that redirect to `ts3server://` URIs, add this to your Caddyfile:

```
yourdomain.com {
    @ts path /ts
    redir @ts ts3server://yourdomain.com?port=9987&{query} 308
}
```

This passes through any query parameters (password, cid, channelpassword) to the TeamSpeak client URI automatically.

## License

[MIT](LICENSE)
