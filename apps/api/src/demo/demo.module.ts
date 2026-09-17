import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module.js';
import { RuntimeModule } from '../runtime/runtime.module.js';
import { AGENT_RUNNER } from '../runner/agent-runner.js';
import { CodexRunner } from '../runner/codex.runner.js';
import { FRONTEND_BUILDER, NextFrontendBuilder } from './frontend-builder.js';
import { DemoController } from './demo.controller.js';
import { DemoService } from './demo.service.js';
@Module({ imports: [StorageModule, RuntimeModule], controllers: [DemoController], providers: [
  DemoService, { provide: AGENT_RUNNER, useClass: CodexRunner }, { provide: FRONTEND_BUILDER, useClass: NextFrontendBuilder },
] })
export class DemoModule {}
