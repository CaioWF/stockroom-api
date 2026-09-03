import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Wrapped explicitly (rather than a bare call) per the no-floating-promises
// convention: an unhandled rejection here must surface, not vanish silently.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
