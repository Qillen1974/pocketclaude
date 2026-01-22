import 'dotenv/config';
import WebSocket from 'ws';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Message, CommandPayload, ProjectConfig, ProjectsConfig, QUICK_SESSION_PROJECT_ID } from './types';
import { SessionManager } from './session-manager';
import { ReconnectManager } from './reconnect';
import { HistoryManager } from './history-manager';

const RELAY_URL = process.env.RELAY_URL;
const RELAY_TOKEN = process.env.RELAY_TOKEN;

if (!RELAY_URL || !RELAY_TOKEN) {
  console.error('RELAY_URL and RELAY_TOKEN environment variables are required');
  process.exit(1);
}

// TypeScript narrowing - these are now guaranteed to be strings
const relayUrl: string = RELAY_URL;
const relayToken: string = RELAY_TOKEN;

// Quick session path - defaults to user home directory
const QUICK_SESSION_PATH = process.env.QUICK_SESSION_PATH || os.homedir();

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
const historyManager = new HistoryManager();

// Track session to project mapping for history
const sessionProjectMap = new Map<string, { projectId: string; projectName: string }>();

function sendMessage(message: Omit<Message, 'timestamp'>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ ...message, timestamp: Date.now() }));
  }
}

function sendOutput(sessionId: string, data: string): void {
  console.log(`[Agent] Sending output for session ${sessionId} (${data.length} chars)`);
  // Record to history
  historyManager.appendOutput(sessionId, data);

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
      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      let project: ProjectConfig;

      // Check if this is a quick session (no projectId or special quick session ID)
      if (!command.projectId || command.projectId === QUICK_SESSION_PROJECT_ID) {
        // Create a virtual project config for quick session
        project = {
          id: QUICK_SESSION_PROJECT_ID,
          name: 'Quick Session',
          path: QUICK_SESSION_PATH,
        };
        console.log(`[Agent] Starting quick session at ${QUICK_SESSION_PATH}`);
      } else {
        // Find the project by ID
        const foundProject = projects.find(p => p.id === command.projectId);
        if (!foundProject) {
          sendError('PROJECT_NOT_FOUND', `Project ${command.projectId} not found`);
          return;
        }
        project = foundProject;
      }

      // Close any existing sessions for this project to prevent accumulation
      const existingSessions = sessionManager.listSessions().filter(s => s.projectId === project.id);
      for (const existingSession of existingSessions) {
        console.log(`[Agent] Closing existing session ${existingSession.sessionId} for project ${project.id}`);
        historyManager.endSession(existingSession.sessionId);
        sessionProjectMap.delete(existingSession.sessionId);
        sessionManager.closeSession(existingSession.sessionId);
      }

      // Get previous context to inject into the new session
      const previousContext = historyManager.getContextSummary(project.id);
      const hasPreviousContext = previousContext.length > 0;

      // Start session with previous context (if any)
      const sessionId = sessionManager.startSession(project, hasPreviousContext ? previousContext : undefined);

      // Start history recording
      sessionProjectMap.set(sessionId, { projectId: project.id, projectName: project.name });
      historyManager.startSession(sessionId, project.id, project.name);

      sendStatus('session_started', {
        sessionId,
        projectId: project.id,
        isQuickSession: project.id === QUICK_SESSION_PROJECT_ID,
        hasPreviousContext
      }, sessionId);
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

      // End history recording
      historyManager.endSession(command.sessionId);
      sessionProjectMap.delete(command.sessionId);

      const success = sessionManager.closeSession(command.sessionId);
      if (!success) {
        sendError('SESSION_NOT_FOUND', `Session ${command.sessionId} not found`, command.sessionId);
      }
      break;
    }

    case 'get_session_history': {
      if (!command.projectId) {
        sendError('MISSING_PROJECT_ID', 'projectId is required');
        return;
      }

      const history = historyManager.getSessionHistory(command.projectId, 10);
      sendStatus('session_history', { projectId: command.projectId, history });
      break;
    }

    case 'get_context_summary': {
      if (!command.projectId) {
        sendError('MISSING_PROJECT_ID', 'projectId is required');
        return;
      }

      const context = historyManager.getContextSummary(command.projectId);
      sendStatus('context_summary', { projectId: command.projectId, context });
      break;
    }

    case 'get_last_session_output': {
      if (!command.projectId) {
        sendError('MISSING_PROJECT_ID', 'projectId is required');
        return;
      }

      const output = historyManager.getLastSessionOutput(command.projectId);
      sendStatus('last_session_output', { projectId: command.projectId, output });
      break;
    }

    case 'keepalive': {
      if (!command.sessionId) {
        sendError('MISSING_SESSION_ID', 'sessionId is required');
        return;
      }

      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      const success = sessionManager.keepalive(command.sessionId);
      if (!success) {
        sendError('SESSION_NOT_FOUND', `Session ${command.sessionId} not found`, command.sessionId);
      }
      break;
    }

    case 'upload_file': {
      if (!command.sessionId) {
        sendError('MISSING_SESSION_ID', 'sessionId is required');
        return;
      }
      if (!command.fileName || !command.fileContent) {
        sendError('MISSING_FILE_DATA', 'fileName and fileContent are required');
        return;
      }

      if (!sessionManager) {
        sendError('NO_SESSION_MANAGER', 'Session manager not initialized');
        return;
      }

      const session = sessionManager.getSession(command.sessionId);
      if (!session) {
        sendError('SESSION_NOT_FOUND', `Session ${command.sessionId} not found`, command.sessionId);
        return;
      }

      try {
        // Create uploads folder in session's working directory
        const uploadsDir = path.join(session.workingDir, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Sanitize filename - remove path components and dangerous characters
        const sanitizedName = path.basename(command.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(uploadsDir, sanitizedName);

        // Decode base64 and write file
        const fileBuffer = Buffer.from(command.fileContent, 'base64');
        fs.writeFileSync(filePath, fileBuffer);

        console.log(`[Agent] File uploaded: ${filePath} (${fileBuffer.length} bytes)`);

        sendStatus('file_uploaded', {
          sessionId: command.sessionId,
          fileName: sanitizedName,
          filePath: filePath,
          size: fileBuffer.length,
        }, command.sessionId);
      } catch (err) {
        console.error('[Agent] File upload error:', err);
        sendError('UPLOAD_FAILED', `Failed to upload file: ${(err as Error).message}`, command.sessionId);
      }
      break;
    }

    default:
      sendError('UNKNOWN_COMMAND', `Unknown command: ${(command as any).command}`);
  }
}

function connect(): void {
  console.log(`[Agent] Connecting to relay at ${relayUrl}`);

  ws = new WebSocket(relayUrl);

  ws.on('open', () => {
    console.log('[Agent] Connected to relay');
    // Don't reset reconnect counter here - wait until authentication succeeds

    // Authenticate
    sendMessage({
      type: 'auth',
      payload: { token: relayToken, role: 'agent' },
    });

    // Initialize session manager only if it doesn't exist
    // This preserves sessions across reconnections
    if (!sessionManager) {
      sessionManager = new SessionManager(
        (sessionId, data) => sendOutput(sessionId, data),
        (sessionId) => sendStatus('session_closed', { sessionId }, sessionId)
      );
    } else {
      console.log(`[Agent] Reconnected with ${sessionManager.listSessions().length} existing session(s)`);
    }
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
      // Reset reconnect counter only after successful authentication
      const payload = message.payload as { status?: string; data?: { role?: string } };
      if (payload.status === 'connected' && payload.data?.role === 'agent') {
        reconnectManager.reset();
        console.log('[Agent] Authentication successful, reconnect counter reset');
      }
    } else if (message.type === 'error') {
      console.error('[Agent] Error:', message.payload);
      // If another agent is already connected, don't keep retrying aggressively
      const errorPayload = message.payload as { code?: string };
      if (errorPayload.code === 'AGENT_EXISTS') {
        console.log('[Agent] Another agent is already connected. Will retry with longer backoff.');
        // Force a longer delay by advancing the attempt counter
        for (let i = 0; i < 5; i++) reconnectManager.getNextDelay();
      }
    } else if (message.type === 'command') {
      handleCommand(message.payload as CommandPayload);
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Agent] Disconnected: ${code} ${reason}`);
    ws = null;

    // Don't destroy sessionManager - keep sessions alive across reconnections
    // Sessions will continue running and resume output when reconnected
    if (sessionManager) {
      const sessionCount = sessionManager.listSessions().length;
      if (sessionCount > 0) {
        console.log(`[Agent] Keeping ${sessionCount} session(s) alive during reconnection`);
      }
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
