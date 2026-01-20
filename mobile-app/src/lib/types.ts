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
  command: 'list_projects' | 'list_sessions' | 'start_session' | 'send_input' | 'close_session';
  projectId?: string;
  input?: string;
  sessionId?: string;
}

export interface OutputPayload {
  data: string;
  sessionId: string;
}

export interface StatusPayload {
  status: 'connected' | 'disconnected' | 'session_started' | 'session_closed' | 'projects_list' | 'sessions_list';
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
}

export interface SessionInfo {
  sessionId: string;
  projectId: string;
  status: 'active' | 'idle';
  lastActivity: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'authenticated';
