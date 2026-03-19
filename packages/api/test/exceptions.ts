/**
 * Typed exceptions for test infrastructure.
 *
 * These replace generic `throw new Error()` in test helpers.
 * Test setup errors must be distinguishable from application errors.
 */

/**
 * Thrown when a test infrastructure prerequisite is not met.
 * E.g., required env vars missing, service not initialized.
 */
export class TestSetupException extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TestSetupException";
    this.code = code;
  }
}

/**
 * Thrown when test infrastructure credentials are missing.
 */
export class TestCredentialsMissingException extends TestSetupException {
  constructor(service: string, details: string) {
    super(
      "TEST_CREDENTIALS_MISSING",
      `${service} credentials missing. ${details}`,
    );
    this.name = "TestCredentialsMissingException";
  }
}

/**
 * Thrown when a test resource was not properly initialized.
 */
export class TestNotInitializedException extends TestSetupException {
  constructor(resource: string, initFunction: string) {
    super(
      "TEST_NOT_INITIALIZED",
      `${resource} not initialized. Call ${initFunction} in beforeAll()`,
    );
    this.name = "TestNotInitializedException";
  }
}
