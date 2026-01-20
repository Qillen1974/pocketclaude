import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { ConnectionManager } from './connection-manager';
import { Message, AuthPayload, HealthResponse } from './types';

const PORT = parseInt(process.env.PORT || '8080', 10);
const RELAY_TOKEN = process.env.RELAY_TOKEN;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds

if (!RELAY_TOKEN) {
  console.error('RELAY_TOKEN environment variable is required');
  process.exit(1);
}

const connectionManager = new ConnectionManager();

// Create HTTP server for health endpoint
const server = http.createServer((req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    const response: HealthResponse = {
      status: 'ok',
      agent: connectionManager.hasAgent(),
      clients: connectionManager.getClientCount(),
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws: WebSocket) => {
  console.log('[Server] New connection');
  let authenticated = false;
  let role: 'agent' | 'client' | null = null;

  // Set up pong handler
  ws.on('pong', () => {
    connectionManager.updatePong(ws);
  });

  ws.on('message', (data: WebSocket.RawData) => {
    let message: Message;
    try {
      message = JSON.parse(data.toString());
    } catch (err) {
      console.error('[Server] Invalid JSON received');
      sendError(ws, 'INVALID_JSON', 'Invalid JSON message');
      return;
    }

    // Handle authentication
    if (message.type === 'auth') {
      const payload = message.payload as AuthPayload;

      if (payload.token !== RELAY_TOKEN) {
        console.log('[Server] Authentication failed: invalid token');
        sendError(ws, 'AUTH_FAILED', 'Invalid token');
        ws.close(4001, 'Authentication failed');
        return;
      }

      if (payload.role === 'agent') {
        if (!connectionManager.registerAgent(ws)) {
          console.log('[Server] Agent registration rejected: agent already connected');
          sendError(ws, 'AGENT_EXISTS', 'An agent is already connected');
          ws.close(4002, 'Agent already connected');
          return;
        }
        role = 'agent';
        // Notify clients that agent is connected
        connectionManager.broadcastToClients({
          type: 'status',
          payload: { status: 'connected', data: { reason: 'agent_connected' } },
          timestamp: Date.now(),
        });
      } else if (payload.role === 'client') {
        connectionManager.registerClient(ws);
        role = 'client';
      } else {
        sendError(ws, 'INVALID_ROLE', 'Role must be "agent" or "client"');
        ws.close(4003, 'Invalid role');
        return;
      }

      authenticated = true;
      ws.send(JSON.stringify({
        type: 'status',
        payload: {
          status: 'connected',
          data: {
            role,
            agentConnected: connectionManager.hasAgent()
          }
        },
        timestamp: Date.now(),
      }));
      console.log(`[Server] ${role} authenticated successfully`);
      return;
    }

    // Reject unauthenticated messages
    if (!authenticated) {
      sendError(ws, 'NOT_AUTHENTICATED', 'Must authenticate first');
      ws.close(4001, 'Not authenticated');
      return;
    }

    // Route messages based on role
    if (role === 'client') {
      // Forward commands from client to agent
      if (message.type === 'command') {
        if (!connectionManager.hasAgent()) {
          sendError(ws, 'NO_AGENT', 'No agent connected');
          return;
        }
        console.log(`[Server] Forwarding command to agent: ${JSON.stringify(message.payload)}`);
        connectionManager.sendToAgent(message);
      }
    } else if (role === 'agent') {
      // Forward output/status from agent to all clients
      if (message.type === 'output' || message.type === 'status' || message.type === 'error') {
        console.log(`[Server] Broadcasting ${message.type} to clients`);
        connectionManager.broadcastToClients(message);
      }
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`[Server] Connection closed: ${code} ${reason}`);
    connectionManager.removeConnection(ws);
  });

  ws.on('error', (err) => {
    console.error('[Server] WebSocket error:', err);
    connectionManager.removeConnection(ws);
  });
});

function sendError(ws: WebSocket, code: string, message: string): void {
  ws.send(JSON.stringify({
    type: 'error',
    payload: { code, message },
    timestamp: Date.now(),
  }));
}

// Start heartbeat interval
setInterval(() => {
  connectionManager.pingAll();
}, HEARTBEAT_INTERVAL);

server.listen(PORT, () => {
  console.log(`[Server] Relay server running on port ${PORT}`);
  console.log(`[Server] Health endpoint: http://localhost:${PORT}/health`);
});
