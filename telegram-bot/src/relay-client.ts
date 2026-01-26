import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  Message,
  AuthPayload,
  CommandPayload,
  OutputPayload,
  StatusPayload,
  ErrorPayload,
  ProjectInfo,
  SessionInfo,
  RelayConnectionState,
  RelayClientEvents,
} from './types';

interface ReconnectConfig {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  jitter: 0.1,
};

export class RelayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private relayUrl: string;
  private token: string;
  private state: RelayConnectionState = 'disconnected';
  private reconnectAttempt: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectConfig: ReconnectConfig;
  private pingInterval: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = true;

  constructor(relayUrl: string, token: string, reconnectConfig?: Partial<ReconnectConfig>) {
    super();
    this.relayUrl = relayUrl;
    this.token = token;
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...reconnectConfig };
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      console.log('[RelayClient] Already connected or connecting');
      return;
    }

    this.state = 'connecting';
    console.log(`[RelayClient] Connecting to ${this.relayUrl}...`);

    this.ws = new WebSocket(this.relayUrl);

    this.ws.on('open', () => {
      console.log('[RelayClient] WebSocket connected, authenticating...');
      this.authenticate();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      this.handleMessage(data);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      console.log(`[RelayClient] Disconnected: ${code} - ${reason.toString()}`);
      this.cleanup();
      this.state = 'disconnected';
      this.emit('disconnected');

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error: Error) => {
      console.error('[RelayClient] WebSocket error:', error.message);
    });

    this.ws.on('pong', () => {
      // Connection is alive
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  private authenticate(): void {
    const authMessage: Message = {
      type: 'auth',
      payload: {
        token: this.token,
        role: 'client',
      } as AuthPayload,
      timestamp: Date.now(),
    };
    this.send(authMessage);
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message: Message = JSON.parse(data.toString());

      switch (message.type) {
        case 'status':
          this.handleStatus(message.payload as StatusPayload, message.sessionId);
          break;

        case 'output':
          this.handleOutput(message.payload as OutputPayload);
          break;

        case 'error':
          this.handleError(message.payload as ErrorPayload);
          break;

        default:
          console.log('[RelayClient] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[RelayClient] Error parsing message:', error);
    }
  }

  private handleStatus(payload: StatusPayload, sessionId?: string): void {
    console.log('[RelayClient] Status:', payload.status);

    switch (payload.status) {
      case 'connected':
        // Only emit 'connected' for our own authentication, not for agent broadcasts
        // Our own auth has data.role === 'client', agent broadcasts have data.reason === 'agent_connected'
        const data = payload.data as { role?: string; reason?: string } | undefined;
        if (data?.role === 'client') {
          this.state = 'connected';
          this.reconnectAttempt = 0;
          this.startPingInterval();
          this.emit('connected');
        } else if (data?.reason === 'agent_connected') {
          // Agent connected - emit a separate event if needed
          console.log('[RelayClient] Agent connected to relay');
        } else if (data?.reason === 'agent_disconnected') {
          console.log('[RelayClient] Agent disconnected from relay');
        }
        break;

      case 'projects_list':
        this.emit('projectsList', payload.data as ProjectInfo[]);
        break;

      case 'sessions_list':
        this.emit('sessionsList', payload.data as SessionInfo[]);
        break;

      case 'session_started':
        this.emit('sessionStarted', sessionId || payload.sessionId || '');
        break;

      case 'session_closed':
        this.emit('sessionClosed', sessionId || payload.sessionId || '');
        break;

      case 'agent_connected':
      case 'agent_disconnected':
        this.emit('status', payload);
        break;

      default:
        this.emit('status', payload);
    }
  }

  private handleOutput(payload: OutputPayload): void {
    this.emit('output', payload.sessionId, payload.data);
  }

  private handleError(payload: ErrorPayload): void {
    console.error('[RelayClient] Error:', payload.code, payload.message);
    this.emit('error', payload);
  }

  private send(message: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[RelayClient] Cannot send, not connected');
    }
  }

  private cleanup(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 25000); // Ping every 25 seconds
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.state = 'reconnecting';

    const baseDelay = Math.min(
      this.reconnectConfig.initialDelay * Math.pow(this.reconnectConfig.multiplier, this.reconnectAttempt),
      this.reconnectConfig.maxDelay
    );

    const jitterRange = baseDelay * this.reconnectConfig.jitter;
    const jitter = Math.random() * jitterRange * 2 - jitterRange;
    const delay = Math.max(0, baseDelay + jitter);

    this.reconnectAttempt++;
    console.log(`[RelayClient] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempt})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  // Public command methods
  sendCommand(command: CommandPayload, sessionId?: string): void {
    const message: Message = {
      type: 'command',
      sessionId,
      payload: command,
      timestamp: Date.now(),
    };
    this.send(message);
  }

  listProjects(): void {
    this.sendCommand({ command: 'list_projects' });
  }

  listSessions(): void {
    this.sendCommand({ command: 'list_sessions' });
  }

  startSession(projectId?: string): void {
    this.sendCommand({ command: 'start_session', projectId });
  }

  sendInput(sessionId: string, input: string): void {
    this.sendCommand({ command: 'send_input', input, sessionId }, sessionId);
  }

  closeSession(sessionId: string): void {
    this.sendCommand({ command: 'close_session', sessionId }, sessionId);
  }

  smartCommand(input: string, sessionId?: string): void {
    this.sendCommand({ command: 'smart_command', input, sessionId }, sessionId);
  }

  uploadFile(sessionId: string, fileName: string, fileContent: string, mimeType?: string): void {
    this.sendCommand({
      command: 'upload_file',
      sessionId,
      fileName,
      fileContent,
      mimeType,
    }, sessionId);
  }

  getState(): RelayConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }
}

// TypeScript declaration merging for proper event typing
export interface RelayClient {
  on<K extends keyof RelayClientEvents>(event: K, listener: RelayClientEvents[K]): this;
  emit<K extends keyof RelayClientEvents>(event: K, ...args: Parameters<RelayClientEvents[K]>): boolean;
}
