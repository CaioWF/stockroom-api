/** FR20: every time comparison in this feature reads from here, never the system clock directly. */
export interface Clock {
  now(): Date;
}
