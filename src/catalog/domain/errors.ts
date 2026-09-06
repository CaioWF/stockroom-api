export class InvalidCursorError extends Error {
  constructor() {
    super('cursor is invalid');
  }
}

export class InvalidPageLimitError extends Error {
  constructor() {
    super('limit is invalid');
  }
}
