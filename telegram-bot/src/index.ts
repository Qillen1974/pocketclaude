import { Telegraf, Context, Markup } from 'telegraf';
import * as dotenv from 'dotenv';
import { RelayClient } from './relay-client';
import { MessageHandler } from './message-handler';
import { OutputFormatter } from './output-formatter';
import { ProjectInfo, SessionInfo, StatusPayload, ErrorPayload } from './types';

dotenv.config();

// Environment validation
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const RELAY_URL = process.env.RELAY_URL || 'wss://pocketclaude-production.up.railway.app';
const RELAY_TOKEN = process.env.RELAY_TOKEN;
const ALLOWED_USER_IDS = process.env.ALLOWED_USER_IDS
  ? process.env.ALLOWED_USER_IDS.split(',').map(id => parseInt(id.trim(), 10))
  : null;

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is required');
  process.exit(1);
}

if (!RELAY_TOKEN) {
  console.error('Error: RELAY_TOKEN is required');
  process.exit(1);
}

// Track which chat is associated with which user for output routing
const chatOutputMap: Map<string, number> = new Map(); // sessionId -> chatId
let lastActiveChatId: number | null = null;

// Initialize components
const relayClient = new RelayClient(RELAY_URL, RELAY_TOKEN);
const messageHandler = new MessageHandler(relayClient);

// Output formatter with callback to send to Telegram
const outputFormatter = new OutputFormatter((sessionId: string, message: string) => {
  const chatId = chatOutputMap.get(sessionId) || lastActiveChatId;
  if (chatId && bot) {
    bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(err => {
      // Retry without markdown if parsing fails
      bot.telegram.sendMessage(chatId, message).catch(console.error);
    });
  }
});

// Initialize Telegram bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Authorization middleware
bot.use((ctx, next) => {
  if (ALLOWED_USER_IDS && ctx.from) {
    if (!ALLOWED_USER_IDS.includes(ctx.from.id)) {
      console.log(`Unauthorized access attempt from user ${ctx.from.id}`);
      return ctx.reply('Access denied. Contact administrator.');
    }
  }
  return next();
});

// Command handlers
bot.command('start', async (ctx) => {
  lastActiveChatId = ctx.chat.id;
  await ctx.reply(
    'Welcome to PocketClaude!\n\n' +
    'I connect you to Claude Code on your PC.\n\n' +
    'Use /projects to see available projects, or /help for all commands.'
  );
});

bot.command('help', async (ctx) => {
  const response = await messageHandler.handleCommand(ctx.chat.id, '/help');
  if (response) {
    await ctx.reply(response);
  }
});

bot.command('projects', async (ctx) => {
  lastActiveChatId = ctx.chat.id;

  if (!relayClient.isConnected()) {
    await ctx.reply('Not connected to relay server. Reconnecting...');
    return;
  }

  await messageHandler.handleCommand(ctx.chat.id, '/projects');
  // Response will come via relay event
});

bot.command('sessions', async (ctx) => {
  lastActiveChatId = ctx.chat.id;
  await messageHandler.handleCommand(ctx.chat.id, '/sessions');
});

bot.command('status', async (ctx) => {
  const response = await messageHandler.handleCommand(ctx.chat.id, '/status');
  if (response) {
    await ctx.reply(response);
  }
});

bot.command('stop', async (ctx) => {
  const userSession = messageHandler.getSession(ctx.chat.id);
  if (userSession?.activeSessionId) {
    chatOutputMap.delete(userSession.activeSessionId);
  }

  const response = await messageHandler.handleCommand(ctx.chat.id, '/stop');
  if (response) {
    await ctx.reply(response);
  } else {
    await ctx.reply('Closing session...');
  }
});

// Custom /start command handler for starting sessions (conflicts with Telegram's /start)
// Use /begin instead
bot.command('begin', async (ctx) => {
  lastActiveChatId = ctx.chat.id;
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  const command = args ? `/start ${args}` : '/start';

  const response = await messageHandler.handleCommand(ctx.chat.id, command);
  if (response) {
    await ctx.reply(response);
  } else {
    await ctx.reply('Starting session...');
  }
});

// Also support /open as an alias for /begin
bot.command('open', async (ctx) => {
  lastActiveChatId = ctx.chat.id;
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  const command = args ? `/start ${args}` : '/start';

  const response = await messageHandler.handleCommand(ctx.chat.id, command);
  if (response) {
    await ctx.reply(response);
  } else {
    await ctx.reply('Starting session...');
  }
});

// Handle regular text messages
bot.on('text', async (ctx) => {
  lastActiveChatId = ctx.chat.id;

  const response = await messageHandler.handleCommand(ctx.chat.id, ctx.message.text);
  if (response) {
    await ctx.reply(response);
  }
});

// Handle photo messages
bot.on('photo', async (ctx) => {
  lastActiveChatId = ctx.chat.id;

  // Get the largest photo size
  const photos = ctx.message.photo;
  const largestPhoto = photos[photos.length - 1];

  try {
    // Get user session
    const userSession = messageHandler.getSession(ctx.chat.id);
    if (!userSession?.activeSessionId) {
      await ctx.reply('No active session. Use /begin [project] to start one, then send your photo.');
      return;
    }

    await ctx.reply('Receiving image...');

    // Get file info and download
    const file = await ctx.telegram.getFile(largestPhoto.file_id);
    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;

    // Download the file
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Content = buffer.toString('base64');

    // Generate filename
    const ext = file.file_path?.split('.').pop() || 'jpg';
    const fileName = `telegram_photo_${Date.now()}.${ext}`;

    // Get caption if provided
    const caption = ctx.message.caption || '';

    // Upload to session
    relayClient.uploadFile(userSession.activeSessionId, fileName, base64Content, `image/${ext}`);

    await ctx.reply(`Image uploaded: ${fileName}\n${caption ? `Caption: ${caption}\n` : ''}Claude will analyze it...`);

  } catch (error) {
    console.error('[Bot] Error handling photo:', error);
    await ctx.reply('Failed to process image. Please try again.');
  }
});

// Relay client event handlers
relayClient.on('connected', () => {
  console.log('[Bot] Connected to relay server');
  if (lastActiveChatId) {
    bot.telegram.sendMessage(lastActiveChatId, 'Connected to relay server.').catch(console.error);
  }
  // Fetch initial project list
  relayClient.listProjects();
});

relayClient.on('disconnected', () => {
  console.log('[Bot] Disconnected from relay server');
  if (lastActiveChatId) {
    bot.telegram.sendMessage(lastActiveChatId, 'Disconnected from relay. Reconnecting...').catch(console.error);
  }
});

relayClient.on('output', (sessionId: string, data: string) => {
  outputFormatter.addOutput(sessionId, data);
});

relayClient.on('projectsList', (data: { projects: ProjectInfo[] } | ProjectInfo[]) => {
  // Handle both wrapped and unwrapped formats
  const projects = Array.isArray(data) ? data : (data.projects || []);
  const message = OutputFormatter.formatProjectList(projects);

  if (lastActiveChatId) {
    // Create inline keyboard for project selection
    if (projects.length > 0) {
      const buttons = projects.map(p =>
        Markup.button.callback(p.name, `project:${p.id}`)
      );
      const keyboard = Markup.inlineKeyboard(buttons, { columns: 1 });

      bot.telegram.sendMessage(lastActiveChatId, message, keyboard).catch(console.error);
    } else {
      bot.telegram.sendMessage(lastActiveChatId, message).catch(console.error);
    }
  }
});

relayClient.on('sessionsList', (data: { sessions: SessionInfo[] } | SessionInfo[]) => {
  // Handle both wrapped and unwrapped formats
  const sessions = Array.isArray(data) ? data : (data.sessions || []);
  const message = OutputFormatter.formatSessionList(sessions);
  if (lastActiveChatId) {
    bot.telegram.sendMessage(lastActiveChatId, message).catch(console.error);
  }
});

relayClient.on('sessionStarted', (sessionId: string) => {
  console.log('[Bot] Session started:', sessionId);

  // Map this session to the last active chat
  if (lastActiveChatId) {
    chatOutputMap.set(sessionId, lastActiveChatId);
    messageHandler.updateUserSession(lastActiveChatId, sessionId);
    bot.telegram.sendMessage(
      lastActiveChatId,
      `Session started: ${sessionId.slice(0, 8)}...\n\nYou can now send messages to Claude.`
    ).catch(console.error);
  }
});

relayClient.on('sessionClosed', (sessionId: string) => {
  console.log('[Bot] Session closed:', sessionId);

  const chatId = chatOutputMap.get(sessionId);
  chatOutputMap.delete(sessionId);

  if (chatId) {
    // Only notify and clear if this session was mapped to a chat
    // The message-handler's listener will clear the session only if it matches
    const userSession = messageHandler.getSession(chatId);
    if (userSession?.activeSessionId === sessionId) {
      bot.telegram.sendMessage(chatId, 'Session closed.').catch(console.error);
    }
  }
});

relayClient.on('status', (payload: StatusPayload) => {
  if (lastActiveChatId) {
    const message = OutputFormatter.formatStatus(payload.status, JSON.stringify(payload.data));
    bot.telegram.sendMessage(lastActiveChatId, message).catch(console.error);
  }
});

relayClient.on('error', (payload: ErrorPayload) => {
  const message = OutputFormatter.formatError(payload.code, payload.message);
  if (lastActiveChatId) {
    bot.telegram.sendMessage(lastActiveChatId, message).catch(console.error);
  }
});

// Handle inline keyboard callbacks for project selection
bot.action(/^project:(.+)$/, async (ctx) => {
  const projectId = ctx.match[1];

  await ctx.answerCbQuery(`Starting ${projectId}...`);

  lastActiveChatId = ctx.chat?.id || lastActiveChatId;
  if (lastActiveChatId) {
    const response = await messageHandler.handleCommand(lastActiveChatId, `/start ${projectId}`);
    if (response) {
      await ctx.reply(response);
    }
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('[Bot] Shutting down...');
  outputFormatter.flushAll();
  relayClient.disconnect();
  await bot.stop('SIGTERM');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Bot] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Bot] Unhandled rejection:', reason);
});

// Start the bot and connect to relay
async function main() {
  console.log('[Bot] Starting PocketClaude Telegram Bot...');

  // Connect to relay
  relayClient.connect();

  // Start Telegram bot
  await bot.launch();
  console.log('[Bot] Telegram bot is running');

  // Enable graceful stop
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((error) => {
  console.error('[Bot] Failed to start:', error);
  process.exit(1);
});
