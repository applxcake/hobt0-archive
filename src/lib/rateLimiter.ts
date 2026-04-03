// Rate limiter for Gemini API (15 requests per minute)
const MAX_REQUESTS_PER_MINUTE = 14; // 14 to be safe
const MINUTE_MS = 60 * 1000;

class RateLimiter {
  private requests: number[] = [];
  private queue: Array<() => void> = [];
  private processing = false;

  private cleanOldRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(t => now - t < MINUTE_MS);
  }

  private canMakeRequest(): boolean {
    this.cleanOldRequests();
    return this.requests.length < MAX_REQUESTS_PER_MINUTE;
  }

  private getWaitTime(): number {
    if (this.requests.length === 0) return 0;
    const oldest = Math.min(...this.requests);
    const wait = MINUTE_MS - (Date.now() - oldest);
    return Math.max(0, wait);
  }

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      if (!this.canMakeRequest()) {
        const wait = this.getWaitTime();
        console.log(`[RateLimiter] Waiting ${Math.ceil(wait / 1000)}s for quota reset...`);
        await new Promise(r => setTimeout(r, wait + 100)); // +100ms buffer
      }

      if (this.canMakeRequest()) {
        this.requests.push(Date.now());
        const resolve = this.queue.shift();
        resolve?.();
      }
    }

    this.processing = false;
  }

  getRemainingQuota(): number {
    this.cleanOldRequests();
    return MAX_REQUESTS_PER_MINUTE - this.requests.length;
  }
}

export const geminiRateLimiter = new RateLimiter();
