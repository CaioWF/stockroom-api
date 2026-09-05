export class RateLimitExceededError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('rate limit exceeded');
    this.name = 'RateLimitExceededError';
  }
}
