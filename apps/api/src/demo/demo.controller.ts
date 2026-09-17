import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApproveDemoSchema, StartDemoSchema } from '@ai-flow/contracts';
import { DemoService } from './demo.service.js';
@Controller('api/demo-runs')
export class DemoController {
  constructor(@Inject(DemoService) private readonly service: DemoService) {}
  @Post() start(@Body() body: unknown) { const input = StartDemoSchema.parse(body); return this.service.start(input.idea, input.requestId); }
  @Get('latest') async latest(@Res() response: Response) { response.json(await this.service.latest()); }
  @Get(':id') snapshot(@Param('id') id: string) { return this.service.snapshot(id); }
  @Post(':id/approve') approve(@Param('id') id: string, @Body() body: unknown) { return this.service.approve(id, ApproveDemoSchema.parse(body).bundleHash); }
  @Post(':id/cancel') cancel(@Param('id') id: string) { return this.service.cancel(id); }
  @Get(':id/artifacts/:artifactId') artifact(@Param('id') id: string, @Param('artifactId') artifactId: string) { return this.service.artifact(id, artifactId); }
  @Get(':id/runs/:runId/logs') logs(@Param('id') id: string, @Param('runId') runId: string) { return this.service.logs(id, runId); }
  @Get(':id/source.zip') async download(@Param('id') id: string, @Res() response: Response) {
    const zip = await this.service.download(id);
    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Disposition', 'attachment; filename="ai-flow-frontend.zip"');
    response.send(zip);
  }
}
