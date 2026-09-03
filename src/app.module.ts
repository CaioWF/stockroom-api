import { Module } from '@nestjs/common';

// Composition root. Feature modules (auth, health, shared/*) register here
// as later tasks add them — see plan.md's File Structure.
@Module({})
export class AppModule {}
