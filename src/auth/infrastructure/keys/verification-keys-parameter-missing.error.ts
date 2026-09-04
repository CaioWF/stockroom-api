/**
 * Infrastructure-layer error (Finding 4, error-taxonomy fix):
 * `ParameterStoreVerificationKeySetProvider.fetchParameterValue` throws this
 * when the configured SSM parameter resolves with no `Value` at all — a
 * misconfigured or unavailable Parameter Store, not a business condition
 * FR24's closed code set models. `AuthExceptionFilter` maps it to the
 * generic `SERVICE_UNAVAILABLE` row and never exposes `parameterName` (an
 * infrastructure identifier) in the HTTP response.
 */
export class VerificationKeysParameterMissingError extends Error {
  constructor(public readonly parameterName: string) {
    super(`SSM parameter ${parameterName} has no value`);
    this.name = 'VerificationKeysParameterMissingError';
  }
}
