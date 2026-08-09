import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { CommercialController } from './commercial.controller.js';
import { CommercialService } from './commercial.service.js';
import {
  DOCUMENT_SECURITY_SCANNER,
  FailClosedDocumentSecurityScanner,
} from './document-security-scanner.port.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, StorageInfrastructureModule],
  controllers: [CommercialController],
  providers: [
    CommercialService,
    FailClosedDocumentSecurityScanner,
    { provide: DOCUMENT_SECURITY_SCANNER, useExisting: FailClosedDocumentSecurityScanner },
  ],
  exports: [CommercialService],
})
export class CommercialModule {}
