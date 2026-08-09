import { Module } from '@nestjs/common';
import { parseDeliveryEnvironment } from '@gdm/config';
import { AuthModule } from '../auth/auth.module.js';
import { CommercialModule } from '../commercial/commercial.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { DeliveryController } from './delivery.controller.js';
import { DELIVERY_OTP_SENDER, FailClosedDeliveryOtpSender } from './delivery-otp-sender.port.js';
import {
  DELIVERY_PROOF_SCANNER,
  FailClosedDeliveryProofScanner,
} from './delivery-proof-scanner.port.js';
import { DELIVERY_RUNTIME_CONFIG, type DeliveryRuntimeConfig } from './delivery-runtime-config.js';
import { DeliveryService } from './delivery.service.js';

@Module({
  imports: [
    AuthModule,
    CommercialModule,
    DatabaseInfrastructureModule,
    StorageInfrastructureModule,
  ],
  controllers: [DeliveryController],
  providers: [
    {
      provide: DELIVERY_RUNTIME_CONFIG,
      useFactory: (): DeliveryRuntimeConfig => parseDeliveryEnvironment(process.env),
    },
    FailClosedDeliveryOtpSender,
    { provide: DELIVERY_OTP_SENDER, useExisting: FailClosedDeliveryOtpSender },
    FailClosedDeliveryProofScanner,
    { provide: DELIVERY_PROOF_SCANNER, useExisting: FailClosedDeliveryProofScanner },
    DeliveryService,
  ],
  exports: [DeliveryService],
})
export class DeliveryModule {}
