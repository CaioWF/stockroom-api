/**
 * Infrastructure-layer error (Finding 4, error-taxonomy fix):
 * `ParameterStoreVerificationKeySetProvider.parsePublicKeyPems` throws this
 * when the SSM parameter's value parses as JSON but is not an array — a
 * malformed configuration value, not a business condition FR24's closed
 * code set models. `AuthExceptionFilter` maps it to the generic
 * `SERVICE_UNAVAILABLE` row and never exposes `parameterName` (an
 * infrastructure identifier) in the HTTP response.
 */
export class VerificationKeysParameterNotJsonArrayError extends Error {
  constructor(public readonly parameterName: string) {
    super(`SSM parameter ${parameterName} value is not a JSON array`);
    this.name = 'VerificationKeysParameterNotJsonArrayError';
  }
}
