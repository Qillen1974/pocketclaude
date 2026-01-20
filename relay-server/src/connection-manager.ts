import WebSocket from 'ws';
import { ConnectionRole } from './types';

interface Connection {
  ws: WebSocket;
  role: ConnectionRole;
  authenticated: boolean;
  lastPong: number;
}

export class ConnectionManager {
  private agent: Connection | null = null;
  private clients: Map<WebSocket, Connection> = new Map();

  hasAgent(): boolean {
    return this.agent !== null && this.agent.ws.readyState === WebSocket.OPEN;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  registerAgent(ws: WebSocket): boolean {
    if (this.hasAgent()) {
      return false;
    }
    this.agent = {
      ws,
      role: 'agent',
      authenticated: true,
      lastPong: Date.now(),
    };
    console.log('[ConnectionManager] Agent registered');
    return true;
  }

  registerClient(ws: WebSocket): void {
    this.clients.set(ws, {
      ws,
      role: 'client',
      authenticated: true,
      lastPong: Date.now(),
    });
    console.log(`[ConnectionManager] Client registered. Total clients: ${this.clients.size}`);
  }

  removeConnection(ws: WebSocket): void {
    if (this.agent?.ws === ws) {
      console.log('[ConnectionManager] Agent disconnected');
      this.agent = null;
      this.broadcastToClients({
        type: 'status',
        payload: { status: 'disconnected', data: { reason: 'agent_disconnected' } },
        timestamp: Date.now(),
      });
    } else if (this.clients.has(ws)) {
      this.clients.delete(ws);
      console.log(`[ConnectionManager] Client disconnected. Total clients: ${this.clients.size}`);
    }
  }

  getAgent(): WebSocket | null {
    return this.agent?.ws ?? null;
  }

  sendToAgent(message: unknown): boolean {
    if (!this.hasAgent()) {
      return false;
    }
    try {
      this.agent!.ws.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('[ConnectionManager] Failed to send to agent:', err);
      return false;
    }
  }

  broadcastToClients(message: unknown): void {
    const data = JSON.stringify(message);
    for (const [ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (err) {
          console.error('[ConnectionManager] Failed to send to client:', err);
        }
      }
    }
  }

  updatePong(ws: WebSocket): void {
    if (this.agent?.ws === ws) {
      this.agent.lastPong = Date.now();
    } else {
      const client = this.clients.get(ws);
      if (client) {
        client.lastPong = Date.now();
      }
    }
  }

  pingAll(): void {
    const now = Date.now();
    const timeout = 60000; // 60 seconds timeout

    if (this.agent) {
      if (now - this.agent.lastPong > timeout) {
        console.log('[ConnectionManager] Agent ping timeout, terminating');
        this.agent.ws.terminate();
        this.agent = null;
      } else if (this.agent.ws.readyState === WebSocket.OPEN) {
        this.agent.ws.ping();
      }
    }

    for (const [ws, conn] of this.clients) {
      if (now - conn.lastPong > timeout) {
        console.log('[ConnectionManager] Client ping timeout, terminating');
        ws.terminate();
        this.clients.delete(ws);
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }
}
