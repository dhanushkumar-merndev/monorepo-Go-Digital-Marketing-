import { Module } from '@nestjs/common';
import { ApiConfigModule } from '../../config/api-config.module.js';
import { OBJECT_STORAGE } from './object-storage.port.js';
import { S3ObjectStorageAdapter } from './s3-object-storage.adapter.js';

@Module({
  imports: [ApiConfigModule],
  providers: [
    S3ObjectStorageAdapter,
    {
      provide: OBJECT_STORAGE,
      useExisting: S3ObjectStorageAdapter,
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageInfrastructureModule {}
