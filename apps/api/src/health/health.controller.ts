import { Controller, Get } from '@nestjs/common';
import { HealthSchema, type Health } from '@ai-flow/contracts';
@Controller('health')
export class HealthController {
  @Get()
  getHealth(): Health { return HealthSchema.parse({ status: 'ok', service: 'ai-flow-api' }); }
}
