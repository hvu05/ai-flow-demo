import { Controller, Get, Inject } from '@nestjs/common';
import { PreflightService } from './preflight.service.js';
@Controller('api/preflight')
export class RuntimeController {
  constructor(@Inject(PreflightService) private readonly preflight: PreflightService) {}
  @Get() check() { return this.preflight.check(); }
}
