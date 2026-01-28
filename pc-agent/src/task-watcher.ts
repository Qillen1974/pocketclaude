import express, { Application, Request, Response, NextFunction } from 'express';

export interface TaskPayload {
  taskId: string;
  title: string;
  description: string;
  projectName: string;
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  priority?: string;
  quadrant?: string;
}

export interface PendingTask extends TaskPayload {
  status: 'pending_approval' | 'approved' | 'rejected' | 'in_progress' | 'completed';
  sessionId?: string;
  receivedAt: Date;
}

type TaskReceivedCallback = (task: PendingTask) => void;

export class TaskWatcher {
  private app: Application;
  private pendingTasks: Map<string, PendingTask> = new Map();
  private onTaskReceived: TaskReceivedCallback;
  private server: ReturnType<Application['listen']> | null = null;

  constructor(port: number, onTaskReceived: TaskReceivedCallback) {
    this.app = express();

    // Enable CORS for all origins (mobile app needs this)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    this.app.use(express.json());
    this.onTaskReceived = onTaskReceived;

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', pendingTasks: this.pendingTasks.size });
    });

    // Webhook endpoint - receives scheduled tasks from TaskQuadrant
    this.app.post('/webhook/task', (req: Request, res: Response) => {
      const payload = req.body as TaskPayload;

      // Validate required fields
      if (!payload.taskId || !payload.title) {
        res.status(400).json({ error: 'Missing taskId or title' });
        return;
      }

      const task: PendingTask = {
        ...payload,
        status: 'pending_approval',
        receivedAt: new Date()
      };

      this.pendingTasks.set(task.taskId, task);
      console.log(`[TaskWatcher] Received scheduled task: ${task.title} (${task.taskId})`);

      this.onTaskReceived(task);
      res.json({ success: true, taskId: task.taskId });
    });

    this.server = this.app.listen(port, () => {
      console.log(`[TaskWatcher] Listening on port ${port} for TaskQuadrant webhooks`);
    });
  }

  getPendingTasks(): PendingTask[] {
    return Array.from(this.pendingTasks.values())
      .filter(t => t.status === 'pending_approval');
  }

  getTask(taskId: string): PendingTask | undefined {
    return this.pendingTasks.get(taskId);
  }

  approveTask(taskId: string): PendingTask | null {
    const task = this.pendingTasks.get(taskId);
    if (task && task.status === 'pending_approval') {
      task.status = 'approved';
      return task;
    }
    return null;
  }

  rejectTask(taskId: string): boolean {
    const task = this.pendingTasks.get(taskId);
    if (task && task.status === 'pending_approval') {
      task.status = 'rejected';
      return true;
    }
    return false;
  }

  updateTaskStatus(taskId: string, status: PendingTask['status'], sessionId?: string): void {
    const task = this.pendingTasks.get(taskId);
    if (task) {
      task.status = status;
      if (sessionId) task.sessionId = sessionId;
    }
  }

  clearCompleted(): number {
    let cleared = 0;
    for (const [id, task] of this.pendingTasks) {
      if (task.status === 'completed' || task.status === 'rejected') {
        this.pendingTasks.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
