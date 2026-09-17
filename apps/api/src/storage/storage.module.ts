import { Module } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { JsonProjectRepository } from './json-project.repository.js';
import { PROJECT_REPOSITORY } from './project-repository.js';
@Module({
  providers: [{
    provide: PROJECT_REPOSITORY,
    useFactory: async () => {
      const repository = new JsonProjectRepository(loadConfig().dataRoot);
      await repository.initialize();
      return repository;
    },
  }],
  exports: [PROJECT_REPOSITORY],
})
export class StorageModule {}
