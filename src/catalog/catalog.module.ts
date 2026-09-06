import { Module, Provider } from '@nestjs/common';

import {
  APP_CONFIG,
  ConfigurationModule,
} from '../shared/config/configuration.module';
import type { AppConfig } from '../shared/config/environment.schema';
import { ObservabilityModule } from '../shared/observability/observability.module';
import { StructuredLogger } from '../shared/observability/structured-logger';
import {
  DYNAMO_DOCUMENT_CLIENT,
  DynamoDocumentClient,
} from '../shared/persistence/dynamo-client.provider';
import { PersistenceModule } from '../shared/persistence/persistence.module';
import { ListCatalog } from './application/list-catalog.usecase';
import type { ProductRepository } from './domain/ports/product-repository';
import { DynamoProductRepository } from './infrastructure/dynamo/product.repository';
import { CatalogController } from './presentation/catalog.controller';

export const PRODUCT_REPOSITORY = Symbol('PRODUCT_REPOSITORY');

const productRepositoryProvider: Provider = {
  provide: PRODUCT_REPOSITORY,
  useFactory: (
    documentClient: DynamoDocumentClient,
    config: AppConfig,
    logger: StructuredLogger,
  ): ProductRepository =>
    new DynamoProductRepository(documentClient, config.tableName, logger),
  inject: [DYNAMO_DOCUMENT_CLIENT, APP_CONFIG, StructuredLogger],
};

const listCatalogProvider: Provider = {
  provide: ListCatalog,
  useFactory: (repository: ProductRepository): ListCatalog =>
    new ListCatalog(repository),
  inject: [PRODUCT_REPOSITORY],
};

@Module({
  imports: [ConfigurationModule, PersistenceModule, ObservabilityModule],
  controllers: [CatalogController],
  providers: [productRepositoryProvider, listCatalogProvider],
})
export class CatalogModule {}
