import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../config/configuration.module';
import {
  DYNAMO_DOCUMENT_CLIENT,
  dynamoClientProvider,
} from './dynamo-client.provider';

/**
 * The shared persistence kernel: the document client and the key grammar
 * (`table-keys.ts`, consumed directly by bounded-context repositories, not
 * re-exported here since it carries no DI wiring of its own).
 */
@Module({
  imports: [ConfigurationModule],
  providers: [dynamoClientProvider],
  exports: [DYNAMO_DOCUMENT_CLIENT],
})
export class PersistenceModule {}
