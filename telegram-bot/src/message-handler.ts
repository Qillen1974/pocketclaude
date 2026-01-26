import { RelayClient } from './relay-client';
import { UserSession, ProjectInfo, SessionInfo } from './types';

export interface ParsedCommand {
  type: 'list_projects' | 'list_sessions' | 'start_session' | 'stop_session' | 'status' | 'help' | 'send_input' | 'smart_command';
  projectId?: string;
  input?: string;
}

export class MessageHandler {
  private relayClient: RelayClient;
  private userSessions: Map<number, UserSession> = new Map();
  private projectCache: ProjectInfo[] = [];
  private sessionCache: SessionInfo[] = [];

  constructor(relayClient: RelayClient) {
    this.relayClient = relayClient;

    // Listen for project list updates
    this.relayClient.on('projectsList', (data: { projects: ProjectInfo[] } | ProjectInfo[]) => {
      // Handle both wrapped and unwrapped formats
      this.projectCache = Array.isArray(data) ? data : (data.projects || []);
    });

    // Listen for session list updates
    this.relayClient.on('sessionsList', (data: { sessions: SessionInfo[] } | SessionInfo[]) => {
      // Handle both wrapped and unwrapped formats
      this.sessionCache = Array.isArray(data) ? data : (data.sessions || []);
    });

    // Listen for session started - handled by index.ts via updateUserSession
    // Don't auto-assign here to avoid race conditions

    // Listen for session closed
    this.relayClient.on('sessionClosed', (sessionId: string) => {
      for (const [chatId, userSession] of this.userSessions.entries()) {
        // Only clear if this is the CURRENT active session
        if (userSession.activeSessionId === sessionId) {
          console.log(`[MessageHandler] Session ${sessionId} closed for chat ${chatId}`);
          userSession.activeSessionId = null;
          userSession.activeProjectId = null;
        }
      }
    });
  }

  /**
   * Parse a message into a command
   */
  parseMessage(text: string): ParsedCommand {
    const trimmed = text.trim();

    // Command parsing
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1);

      switch (cmd) {
        case 'projects':
        case 'list':
          return { type: 'list_projects' };

        case 'sessions':
          return { type: 'list_sessions' };

        case 'start':
          return {
            type: 'start_session',
            projectId: args[0] || undefined,
          };

        case 'stop':
        case 'close':
        case 'end':
          return { type: 'stop_session' };

        case 'status':
          return { type: 'status' };

        case 'help':
          return { type: 'help' };

        default:
          // Unknown command, treat as input
          return { type: 'send_input', input: trimmed };
      }
    }

    // Regular text - could be input for active session or smart command
    return { type: 'send_input', input: trimmed };
  }

  /**
   * Handle a command for a specific user
   */
  async handleCommand(chatId: number, text: string): Promise<string | null> {
    const command = this.parseMessage(text);
    const userSession = this.getUserSession(chatId);

    switch (command.type) {
      case 'list_projects':
        this.relayClient.listProjects();
        return null; // Response will come via event

      case 'list_sessions':
        this.relayClient.listSessions();
        return null;

      case 'start_session':
        return this.handleStartSession(userSession, command.projectId);

      case 'stop_session':
        return this.handleStopSession(userSession);

      case 'status':
        return this.getStatusMessage(userSession);

      case 'help':
        return this.getHelpMessage();

      case 'send_input':
        return this.handleInput(userSession, command.input || '');

      case 'smart_command':
        return this.handleSmartCommand(userSession, command.input || '');

      default:
        return 'Unknown command. Use /help for available commands.';
    }
  }

  /**
   * Get or create user session
   */
  private getUserSession(chatId: number): UserSession {
    let session = this.userSessions.get(chatId);
    if (!session) {
      session = {
        chatId,
        activeSessionId: null,
        activeProjectId: null,
        lastActivity: Date.now(),
      };
      this.userSessions.set(chatId, session);
    }
    session.lastActivity = Date.now();
    return session;
  }

  /**
   * Handle starting a session
   */
  private handleStartSession(userSession: UserSession, projectId?: string): string | null {
    if (!this.relayClient.isConnected()) {
      return 'Not connected to relay server. Please wait for connection.';
    }

    if (userSession.activeSessionId) {
      return `Already have an active session (${userSession.activeProjectId || 'quick'}). Use /stop to close it first.`;
    }

    // If project ID is provided, validate it exists
    if (projectId) {
      const project = this.findProject(projectId);
      if (!project) {
        const suggestions = this.suggestProjects(projectId);
        if (suggestions.length > 0) {
          return `Project "${projectId}" not found. Did you mean: ${suggestions.join(', ')}?`;
        }
        return `Project "${projectId}" not found. Use /projects to see available projects.`;
      }
      userSession.activeProjectId = project.id;
    } else {
      userSession.activeProjectId = null;
    }

    this.relayClient.startSession(projectId);
    return null; // Response will come via event
  }

  /**
   * Handle stopping a session
   */
  private handleStopSession(userSession: UserSession): string | null {
    if (!userSession.activeSessionId) {
      return 'No active session to close.';
    }

    // Try to close on relay, but clear locally regardless
    this.relayClient.closeSession(userSession.activeSessionId);

    // Clear local state immediately (don't wait for relay response)
    const oldSessionId = userSession.activeSessionId;
    userSession.activeSessionId = null;
    userSession.activeProjectId = null;
    console.log(`[MessageHandler] Cleared local session ${oldSessionId}`);

    return 'Session closed.';
  }

  /**
   * Handle regular input for active session
   */
  private handleInput(userSession: UserSession, input: string): string | null {
    console.log(`[MessageHandler] handleInput: chatId=${userSession.chatId}, activeSession=${userSession.activeSessionId}, sessionCache=${this.sessionCache.length}`);

    if (!this.relayClient.isConnected()) {
      return 'Not connected to relay server.';
    }

    // If user doesn't have an active session, try to find one from cache
    if (!userSession.activeSessionId && this.sessionCache.length > 0) {
      const availableSession = this.sessionCache[0];
      userSession.activeSessionId = availableSession.sessionId;
      userSession.activeProjectId = availableSession.projectId;
      console.log(`[MessageHandler] Auto-linked to session ${availableSession.sessionId}`);
    }

    if (!userSession.activeSessionId) {
      // No active session - use smart routing to auto-start one
      console.log(`[MessageHandler] No active session, using smart routing`);
      return this.handleSmartCommand(userSession, input);
    }

    // Send to active session
    console.log(`[MessageHandler] Sending input to session ${userSession.activeSessionId}`);
    this.relayClient.sendInput(userSession.activeSessionId, input);
    return null;
  }

  /**
   * Handle smart command routing
   */
  private handleSmartCommand(userSession: UserSession, input: string): string | null {
    if (!this.relayClient.isConnected()) {
      return 'Not connected to relay server.';
    }

    // If there's an active session, send to it
    if (userSession.activeSessionId) {
      this.relayClient.sendInput(userSession.activeSessionId, input);
      return null;
    }

    // Otherwise, use smart routing on the agent side
    this.relayClient.smartCommand(input);
    return 'Routing your request...';
  }

  /**
   * Get status message
   */
  private getStatusMessage(userSession: UserSession): string {
    const lines: string[] = [];

    // Connection status
    const relayState = this.relayClient.getState();
    lines.push(`Relay: ${relayState}`);

    // Active session
    if (userSession.activeSessionId) {
      lines.push(`Session: ${userSession.activeSessionId.slice(0, 8)}... (${userSession.activeProjectId || 'quick'})`);
    } else {
      lines.push('Session: None');
    }

    // Cached info
    lines.push(`Projects: ${this.projectCache.length} available`);
    lines.push(`Sessions: ${this.sessionCache.length} active`);

    return lines.join('\n');
  }

  /**
   * Get help message
   */
  private getHelpMessage(): string {
    return `PocketClaude Telegram Bot

Commands:
  /projects - List available projects
  /sessions - List active sessions
  /start [project] - Start a session
  /stop - Close current session
  /status - Show connection status
  /help - Show this help

Tips:
- Start with /projects to see what's available
- Use /start without a project for a quick session
- Just type normally to send messages to Claude
- Without an active session, messages are auto-routed`;
  }

  /**
   * Find a project by ID or name
   */
  private findProject(query: string): ProjectInfo | null {
    const lowerQuery = query.toLowerCase();

    // Exact ID match
    const exactMatch = this.projectCache.find(p => p.id.toLowerCase() === lowerQuery);
    if (exactMatch) return exactMatch;

    // Name contains query
    const nameMatch = this.projectCache.find(p => p.name.toLowerCase().includes(lowerQuery));
    if (nameMatch) return nameMatch;

    // Keyword match (if available)
    const keywordMatch = this.projectCache.find(p =>
      p.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
    );
    if (keywordMatch) return keywordMatch;

    return null;
  }

  /**
   * Suggest similar projects
   */
  private suggestProjects(query: string): string[] {
    const lowerQuery = query.toLowerCase();
    const suggestions: string[] = [];

    for (const project of this.projectCache) {
      // Check for partial matches
      if (project.id.toLowerCase().includes(lowerQuery) ||
          lowerQuery.includes(project.id.toLowerCase()) ||
          project.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push(project.id);
      }
    }

    return suggestions.slice(0, 3);
  }

  /**
   * Update user session with session ID
   */
  updateUserSession(chatId: number, sessionId: string, projectId?: string): void {
    const userSession = this.getUserSession(chatId);
    console.log(`[MessageHandler] updateUserSession: chat=${chatId}, old=${userSession.activeSessionId}, new=${sessionId}`);
    userSession.activeSessionId = sessionId;
    userSession.activeProjectId = projectId || null;
  }

  /**
   * Clear user session
   */
  clearUserSession(chatId: number): void {
    const userSession = this.userSessions.get(chatId);
    if (userSession) {
      userSession.activeSessionId = null;
      userSession.activeProjectId = null;
    }
  }

  /**
   * Get user session for a chat
   */
  getSession(chatId: number): UserSession | undefined {
    return this.userSessions.get(chatId);
  }

  /**
   * Get cached projects
   */
  getProjects(): ProjectInfo[] {
    return this.projectCache;
  }

  /**
   * Get cached sessions
   */
  getSessions(): SessionInfo[] {
    return this.sessionCache;
  }
}
