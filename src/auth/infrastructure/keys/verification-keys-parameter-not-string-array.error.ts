/**
 * Infrastructure-layer error (Finding 4, error-taxonomy fix):
 * `ParameterStoreVerificationKeySetProvider.parsePublicKeyPems` throws this
 * when the SSM parameter's value is a JSON array but contains a non-string
 * element — a malformed configuration value, not a business condition
 * FR24's closed code set models. `AuthExceptionFilter` maps it to the
 * generic `SERVICE_UNAVAILABLE` row and never exposes `parameterName` (an
 * infrastructure identifier) in the HTTP response.
 */
export class VerificationKeysParameterNotStringArrayError extends Error {
  constructor(public readonly parameterName: string) {
    super(`SSM parameter ${parameterName} value is not an array of strings`);
    this.name = 'VerificationKeysParameterNotStringArrayError';
  }
}
