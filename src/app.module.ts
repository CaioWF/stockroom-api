import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';

// Composition root. Feature modules (auth, health, shared/*) register here
// as later tasks add them — see plan.md's File Structure.
@Module({
  imports: [AuthModule, HealthModule],
})
export class AppModule {}
