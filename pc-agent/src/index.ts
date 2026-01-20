import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import { Message, CommandPayload, ProjectConfig, ProjectsConfig } from './types';
import { SessionManager } from './session-manager';
import { ReconnectManager } from './reconnect';

const RELAY_URL = process.env.RELAY_URL;
const RELAY_TOKEN = process.env.RELAY_TOKEN;

if (!RELAY_URL) {
  console.error('RELAY_URL environment variable is required');
  process.exit(1);
}

if (!RELAY_TOKEN) {
  console.error('RELAY_TOKEN environment variable is required');
  process.exit(1);
}

// Load projects config
function loadProjects(): ProjectConfig[] {
  const configPath = path.join(__dirname, '..', 'projects.json');
  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    const config: ProjectsConfig = JSON.parse(data);
    console.log(`[Agent] Loaded ${config.projects.length} projects from config`);
    return config.projects;
  } catch (err) {
    console.error('[Agent] Failed to load projects.json:', err);
    return [];
  }
}

let projects = loadProjects();
let ws: WebSocket | null = null;
let sessionManager: SessionManager | null = null;
const reconnectManager = new ReconnectManager();

function sendMessage(message: Omit<Message, 'timestamp'>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...message, timestamp: Date.now() }));
  }
}

function sendOutput(sessionId: string, data: string): void {
  sendMessage({
    type: 'output',
    sessionId,
    payload: { data, sessionId },
  });
}

function sendStatus(status: string, data?: unknown, sessionId?: string): void {
  sendMessage({
    type: 'status',
    sessionId,
    payload: { status, data, sessionId },
  });
}

function sendError(code: string, message: string, sessionId?: string): void {
  sendMessage({
    type: 'error',
    sessionId,
    payload: { code, message },
  });
}

function handleCommand(command: CommandPayload): void {
  console.log(`[Agent] Handling command: ${command.command}`);

  switch (command.command) {
    case 'list_projects': {
      sendStatus('projects_list', { projects });
      break;
    }

    case 'list_sessions': {
      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }
      const sessions = sessionManager.listSessions();
      sendStatus('sessions_list', { sessions });
      break;
    }

    case 'start_session': {
      if (!command.projectId) {
        sendError('MISSING_PROJECT_ID', 'projectId is required');
        return;
      }

      const project = projects.find(p => p.id === command.projectId);
      if (!project) {
        sendError('PROJECT_NOT_FOUND', `Project ${command.projectId} not found`);
        return;
      }

      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      const sessionId = sessionManager.startSession(project);
      sendStatus('session_started', { sessionId, projectId: command.projectId }, sessionId);
      break;
    }

    case 'send_input': {
      if (!command.sessionId) {
        sendError('MISSING_SESSION_ID', 'sessionId is required');
        return;
      }
      if (command.input === undefined) {
        sendError('MISSING_INPUT', 'input is required');
        return;
      }

      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      const success = sessionManager.sendInput(command.sessionId, command.input);
      if (!success) {
        sendError('SESSION_NOT_FOUND', `Session ${command.sessionId} not found`, command.sessionId);
      }
      break;
    }

    case 'close_session': {
      if (!command.sessionId) {
        sendError('MISSING_SESSION_ID', 'sessionId is required');
        return;
      }

      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      const success = sessionManager.closeSession(command.sessionId);
      if (!success) {
        sendError('SESSION_NOT_FOUND', `Session ${command.sessionId} not found`, command.sessionId);
      }
      break;
    }

    default:
      sendError('UNKNOWN_COMMAND', `Unknown command: ${(command as any).command}`);
  }
}

function connect(): void {
  console.log(`[Agent] Connecting to relay at ${RELAY_URL}`);

  ws = new WebSocket(RELAY_URL);

  ws.on('open', () => {
    console.log('[Agent] Connected to relay');
    reconnectManager.reset();

    // Authenticate
    sendMessage({
      type: 'auth',
      payload: { token: RELAY_TOKEN, role: 'agent' },
    });

    // Initialize session manager
    sessionManager = new SessionManager(
      (sessionId, data) => sendOutput(sessionId, data),
      (sessionId) => sendStatus('session_closed', { sessionId }, sessionId)
    );
  });

  ws.on('message', (data: WebSocket.RawData) => {
    let message: Message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('[Agent] Invalid JSON received:', err);
      return;
    }

    if (message.type === 'status') {
      console.log('[Agent] Status:', message.payload);
    } else if (message.type === 'error') {
      console.error('[Agent] Error:', message.payload);
    } else if (message.type === 'command') {
      handleCommand(message.payload as CommandPayload);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Agent] Disconnected: ${code} ${reason}`);
    ws = null;

    if (sessionManager) {
      sessionManager.destroy();
      sessionManager = null;
    }

    reconnectManager.scheduleReconnect(connect);
  });

  ws.on('error', (err) => {
    console.error('[Agent] WebSocket error:', err.message);
  });

  ws.on('pong', () => {
    // Connection is alive
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Agent] Shutting down...');
  if (sessionManager) {
    sessionManager.destroy();
  }
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Agent] Shutting down...');
  if (sessionManager) {
    sessionManager.destroy();
  }
  if (ws) {
    ws.close();
  }
  process.exit(0);
});

// Start connection
connect();
