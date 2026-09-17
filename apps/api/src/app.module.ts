import { DemoModule } from './demo/demo.module.js';
import { RuntimeModule } from './runtime/runtime.module.js';
import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { StorageModule } from './storage/storage.module.js';
@Module({ imports: [StorageModule, RuntimeModule, DemoModule], controllers: [HealthController] })
export class AppModule {}
