import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { RegistrationController } from './registration.controller.js';
import { CustomerVehiclesController } from './customer-vehicles.controller.js';
import { FailClosedRcDocumentScanner, RC_DOCUMENT_SCANNER } from './rc-document-scanner.port.js';
import { RegistrationService } from './registration.service.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, StorageInfrastructureModule],
  controllers: [RegistrationController, CustomerVehiclesController],
  providers: [
    RegistrationService,
    { provide: RC_DOCUMENT_SCANNER, useClass: FailClosedRcDocumentScanner },
  ],
  exports: [RegistrationService],
})
export class RegistrationModule {}
