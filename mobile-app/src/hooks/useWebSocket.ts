'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Message, ConnectionStatus, CommandPayload } from '@/lib/types';

const RELAY_URL = process.env.NEXT_PUBLIC_RELAY_URL || 'ws://localhost:8080';

interface UseWebSocketOptions {
  onMessage?: (message: Message) => void;
  onStatusChange?: (status: ConnectionStatus) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [agentConnected, setAgentConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateStatus = useCallback((newStatus: ConnectionStatus) => {
    setStatus(newStatus);
    options.onStatusChange?.(newStatus);
  }, [options]);

  const connect = useCallback((token: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    tokenRef.current = token;
    updateStatus('connecting');

    const ws = new WebSocket(RELAY_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      updateStatus('connected');
      // Send auth
      ws.send(JSON.stringify({
        type: 'auth',
        payload: { token, role: 'client' },
        timestamp: Date.now(),
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);

        // Handle status messages for agent connection
        if (message.type === 'status') {
          const payload = message.payload as { status: string; data?: { agentConnected?: boolean; reason?: string } };
          if (payload.status === 'connected') {
            updateStatus('authenticated');
            if (payload.data?.agentConnected !== undefined) {
              setAgentConnected(payload.data.agentConnected);
            }
          }
          if (payload.data?.reason === 'agent_connected') {
            setAgentConnected(true);
          }
          if (payload.data?.reason === 'agent_disconnected') {
            setAgentConnected(false);
          }
        }

        options.onMessage?.(message);
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      updateStatus('disconnected');
      setAgentConnected(false);
      wsRef.current = null;

      // Auto-reconnect if we have a token
      if (tokenRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          if (tokenRef.current) {
            connect(tokenRef.current);
          }
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
    };
  }, [updateStatus, options]);

  const disconnect = useCallback(() => {
    tokenRef.current = null;
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    updateStatus('disconnected');
    setAgentConnected(false);
  }, [updateStatus]);

  const sendCommand = useCallback((command: CommandPayload) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      console.error('[WebSocket] Not connected');
      return false;
    }

    wsRef.current.send(JSON.stringify({
      type: 'command',
      sessionId: command.sessionId,
      payload: command,
      timestamp: Date.now(),
    }));
    return true;
  }, []);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    status,
    agentConnected,
    connect,
    disconnect,
    sendCommand,
  };
}
