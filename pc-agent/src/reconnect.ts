export interface ReconnectConfig {
  initialDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: number;
}

const DEFAULT_CONFIG: ReconnectConfig = {
  initialDelay: 1000,
  maxDelay: 30000,
  multiplier: 2,
  jitter: 0.1,
};

export class ReconnectManager {
  private config: ReconnectConfig;
  private attempt: number = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(config: Partial<ReconnectConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.attempt = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getNextDelay(): number {
    const baseDelay = Math.min(
      this.config.initialDelay * Math.pow(this.config.multiplier, this.attempt),
      this.config.maxDelay
    );

    // Add jitter to prevent thundering herd
    const jitterRange = baseDelay * this.config.jitter;
    const jitter = Math.random() * jitterRange * 2 - jitterRange;

    this.attempt++;
    return Math.max(0, baseDelay + jitter);
  }

  scheduleReconnect(callback: () => void): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    const delay = this.getNextDelay();
    console.log(`[Reconnect] Scheduling reconnect in ${Math.round(delay)}ms (attempt ${this.attempt})`);

    this.timer = setTimeout(() => {
      this.timer = null;
      callback();
    }, delay);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getAttempt(): number {
    return this.attempt;
  }
}
