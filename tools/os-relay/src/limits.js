/* A token bucket: take(n) spends n tokens and returns how long to wait (ms) before the bytes may move. */
export class TokenBucket {
  constructor(ratePerSecond, burst = ratePerSecond, now = () => performance.now()) {
    this.rate = ratePerSecond;
    this.burst = burst;
    this.tokens = burst;
    this.now = now;
    this.last = now();
  }

  take(amount) {
    if (!Number.isFinite(this.rate) || this.rate <= 0) return 0;
    const now = this.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
    this.last = now;
    this.tokens -= amount;
    return this.tokens >= 0 ? 0 : Math.ceil((-this.tokens / this.rate) * 1000);
  }
}

/* Counts events in a sliding one-minute window. */
export class WindowCounter {
  constructor(limit, windowMs = 60_000, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.times = [];
  }

  /* Records an event and returns false if it is over the limit. */
  hit() {
    const now = this.now();
    while (this.times.length && this.times[0] <= now - this.windowMs) this.times.shift();
    if (this.times.length >= this.limit) return false;
    this.times.push(now);
    return true;
  }
}
