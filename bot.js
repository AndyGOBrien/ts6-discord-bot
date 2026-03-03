const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, ActivityType } = require('discord.js');

// ─── CONFIG ────────────────────────────────────────────────────────────────
const config = {
  // TeamSpeak
  TS_API_BASE:   process.env.TS_API_BASE   || 'http://localhost:10080/1',
  TS_API_KEY:    process.env.TS_API_KEY    || 'YOUR_TS_API_KEY',
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '5000'),
  TS_INVITE_URL: process.env.TS_INVITE_LINK || null,
  TS_SERVER_PASSWORD: process.env.TS_SERVER_PASSWORD || null,
  TS_CHANNEL_ID: process.env.TS_CHANNEL_ID || null,
  TS_CHANNEL_PASSWORD: process.env.TS_CHANNEL_PASSWORD || null,

  // Discord
  DISCORD_TOKEN:       process.env.DISCORD_TOKEN       || 'YOUR_DISCORD_BOT_TOKEN',
  STATUS_CHANNEL_ID:   process.env.STATUS_CHANNEL_ID   || 'YOUR_STATUS_CHANNEL_ID',
};
// ───────────────────────────────────────────────────────────────────────────

const discord = new Client({ intents: [GatewayIntentBits.Guilds] });

// State
let previousNicknames = new Set();
let statusMessage = null;
let lastStatusCount = -1;

// ─── TEAMSPEAK ──────────────────────────────────────────────────────────────

async function fetchTSClients() {
  const url = `${config.TS_API_BASE}/clientlist?ts=${Date.now()}`;

  const res = await fetch(url, {
    headers: {
      'x-api-key': config.TS_API_KEY,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`TS API responded ${res.status}`);

  const json = await res.json();
  if (json.status?.code !== 0) throw new Error(`TS API error: ${json.status?.message}`);

  return (json.body || []).filter(c => String(c.client_type) === '0');
}

// ─── DISCORD HELPERS ────────────────────────────────────────────────────────

function buildStatusEmbed(nicknames) {
  const sorted = [...nicknames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const count = sorted.length;

  const embed = new EmbedBuilder()
    .setTitle('TeamSpeak Server Status')
    .setColor(count > 0 ? 0x2ecc71 : 0x95a5a6)
    .setFooter({ text: `${count} user${count !== 1 ? 's' : ''} online` })
    .setTimestamp();

    if (config.TS_INVITE_URL) {
      const params = [
        config.TS_SERVER_PASSWORD ? `password=${config.TS_SERVER_PASSWORD}` : '',
        config.TS_CHANNEL_ID ? `cid=${config.TS_CHANNEL_ID}` : '',
        config.TS_CHANNEL_PASSWORD ? `channelpassword=${config.TS_CHANNEL_PASSWORD}` : '',
      ].filter(Boolean).join('&');
    
      const url = params ? `${config.TS_INVITE_URL}?${params}` : config.TS_INVITE_URL;
      embed.setDescription(`[Click here to join](${url})`);
    }

  embed.addFields({
    name: 'Users Online',
    value: count > 0
      ? sorted.map(n => `• **${n}**`).join('\n')
      : '*No users currently connected*',
    inline: false,
  });

  return embed;
}

function updateBotActivity(count) {
  if (count === lastStatusCount) return;

  const label = count === 1 ? 'user' : 'users';
  const text = count > 0
    ? `${count} ${label} on TeamSpeak`
    : 'TeamSpeak — no users online';

  discord.user.setActivity(text, { type: ActivityType.Watching });
  lastStatusCount = count;
  console.log(`[Discord] Bot activity set to: "Watching ${text}"`);
}

async function lockChannel(channel) {
  try {
    const everyoneRole = channel.guild.roles.everyone;
    await channel.permissionOverwrites.edit(everyoneRole, {
      [PermissionsBitField.Flags.SendMessages]: false,
      [PermissionsBitField.Flags.AddReactions]: false,
      [PermissionsBitField.Flags.CreatePublicThreads]: false,
      [PermissionsBitField.Flags.CreatePrivateThreads]: false,
      [PermissionsBitField.Flags.ViewChannel]: true,
    });
    console.log('[Discord] Channel locked to read-only for @everyone');
  } catch (err) {
    console.error('[Discord] Failed to lock channel:', err.message);
  }
}

async function purgeChannel(channel) {
  try {
    let fetched;
    do {
      fetched = await channel.messages.fetch({ limit: 100 });
      if (fetched.size > 0) {
        const recent = fetched.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
        const old = fetched.filter(m => Date.now() - m.createdTimestamp >= 14 * 24 * 60 * 60 * 1000);

        if (recent.size > 0) await channel.bulkDelete(recent, true);
        for (const [, msg] of old) {
          await msg.delete().catch(() => {});
        }
      }
    } while (fetched.size > 0);

    console.log('[Discord] Channel purged');
  } catch (err) {
    console.error('[Discord] Failed to purge channel:', err.message);
  }
}

async function initStatusMessage(channel, nicknames) {
  await purgeChannel(channel);
  await lockChannel(channel);

  const embed = buildStatusEmbed(nicknames);
  statusMessage = await channel.send({ embeds: [embed] });
  console.log('[Discord] Status message created');
}

async function updateStatusMessage(nicknames) {
  try {
    const embed = buildStatusEmbed(nicknames);

    if (!statusMessage) {
      const channel = await discord.channels.fetch(config.STATUS_CHANNEL_ID);
      if (!channel) return;

      const messages = await channel.messages.fetch({ limit: 10 });
      const existing = messages.find(m => m.author.id === discord.user.id && m.embeds.length > 0);

      if (existing) {
        statusMessage = existing;
        await statusMessage.edit({ embeds: [embed] });
      } else {
        statusMessage = await channel.send({ embeds: [embed] });
        console.log('[Discord] Status message (re)created in updateStatusMessage');
      }
    } else {
      await statusMessage.edit({ embeds: [embed] });
    }
  } catch (err) {
    console.error('[Discord] Failed to edit or (re)create status message:', err.message);
  }
}

// ─── POLL LOOP ───────────────────────────────────────────────────────────────

async function poll() {
  try {
    const clients = await fetchTSClients();
    const currentNicknames = new Set(clients.map(c => c.client_nickname));

    const changed = currentNicknames.size !== previousNicknames.size ||
      [...currentNicknames].some(n => !previousNicknames.has(n));

    if (changed) {
      const joined = [...currentNicknames].filter(n => !previousNicknames.has(n));
      const left   = [...previousNicknames].filter(n => !currentNicknames.has(n));
      joined.forEach(n => console.log(`[TS6] JOIN: ${n}`));
      left.forEach(n => console.log(`[TS6] LEAVE: ${n}`));

      await updateStatusMessage(currentNicknames);
      updateBotActivity(currentNicknames.size);
    }

    previousNicknames = currentNicknames;

  } catch (err) {
    console.error('[Poll] Error:', err.message);
  }
}

// ─── STARTUP ─────────────────────────────────────────────────────────────────

discord.once('clientReady', async () => {
  console.log(`[Discord] Logged in as ${discord.user.tag}`);
  console.log(`[Config] Polling TS6 at ${config.TS_API_BASE} every ${config.POLL_INTERVAL / 1000}s`);

  try {
    const clients = await fetchTSClients();
    const currentNicknames = new Set(clients.map(c => c.client_nickname));
    previousNicknames = currentNicknames;

    console.log(`[TS6] Bot started. ${currentNicknames.size} user(s) currently online:`);
    currentNicknames.forEach(n => console.log(`  - ${n}`));

    const channel = await discord.channels.fetch(config.STATUS_CHANNEL_ID);
    if (channel) await initStatusMessage(channel, currentNicknames);
    updateBotActivity(currentNicknames.size);
  } catch (err) {
    console.error('[Startup] Failed initial setup:', err.message);
  }

  setInterval(poll, config.POLL_INTERVAL);
});

discord.on('error', err => console.error('[Discord] Client error:', err));

discord.login(config.DISCORD_TOKEN);