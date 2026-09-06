export class MalformedProductItemError extends Error {
  constructor() {
    super('stored product item is malformed');
  }
}
