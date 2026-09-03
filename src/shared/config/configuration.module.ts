import { Module } from '@nestjs/common';
import { parseAppConfig } from './environment.schema';

/** DI token for the parsed {@link AppConfig}; see environment.schema.ts. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Parses `process.env` once at module load and exposes the typed result via
 * DI. Fail-fast: a missing or malformed variable throws during Nest's
 * module resolution, before any request handler can run.
 */
@Module({
  providers: [{ provide: APP_CONFIG, useValue: parseAppConfig(process.env) }],
  exports: [APP_CONFIG],
})
export class ConfigurationModule {}
