import { Module } from '@nestjs/common';
import { PreflightService } from './preflight.service.js';
import { RuntimeController } from './runtime.controller.js';
@Module({ providers: [PreflightService], controllers: [RuntimeController], exports: [PreflightService] })
export class RuntimeModule {}
