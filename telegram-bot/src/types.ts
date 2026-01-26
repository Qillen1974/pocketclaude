// Message types for relay communication
export type MessageType = 'auth' | 'command' | 'output' | 'status' | 'error';
export type ConnectionRole = 'agent' | 'client';

export interface Message {
  type: MessageType;
  sessionId?: string;
  payload: unknown;
  timestamp: number;
}

export interface AuthPayload {
  token: string;
  role: ConnectionRole;
}

export interface CommandPayload {
  command: 'list_projects' | 'list_sessions' | 'start_session' | 'send_input' | 'close_session' | 'smart_command' | 'upload_file';
  projectId?: string;
  input?: string;
  sessionId?: string;  // Required for send_input and close_session
  // File upload fields
  fileName?: string;
  fileContent?: string;  // Base64 encoded
  mimeType?: string;
}

export interface OutputPayload {
  data: string;
  sessionId: string;
}

export interface StatusPayload {
  status: 'connected' | 'disconnected' | 'session_started' | 'session_closed' | 'projects_list' | 'sessions_list' | 'agent_connected' | 'agent_disconnected';
  data?: unknown;
  sessionId?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  keywords?: string[];
  description?: string;
  techStack?: string[];
}

export interface SessionInfo {
  sessionId: string;
  projectId: string;
  status: 'active' | 'idle';
  lastActivity: number;
}

// Telegram bot specific types
export interface UserSession {
  chatId: number;
  activeSessionId: string | null;
  activeProjectId: string | null;
  lastActivity: number;
}

export type RelayConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface RelayClientEvents {
  connected: () => void;
  disconnected: () => void;
  output: (sessionId: string, data: string) => void;
  status: (payload: StatusPayload) => void;
  error: (payload: ErrorPayload) => void;
  projectsList: (projects: ProjectInfo[]) => void;
  sessionsList: (sessions: SessionInfo[]) => void;
  sessionStarted: (sessionId: string) => void;
  sessionClosed: (sessionId: string) => void;
}
