import { Injectable } from '@nestjs/common';

export const DELIVERY_PROOF_SCANNER = Symbol('DELIVERY_PROOF_SCANNER');

export type DeliveryProofScanStatus = 'CLEAN' | 'REJECTED' | 'UNAVAILABLE';

export interface DeliveryProofScanResult {
  reason: string;
  status: DeliveryProofScanStatus;
}

export interface DeliveryProofScanner {
  scan(input: { contentType: string; objectKey: string }): Promise<DeliveryProofScanResult>;
}

@Injectable()
export class FailClosedDeliveryProofScanner implements DeliveryProofScanner {
  scan(): Promise<DeliveryProofScanResult> {
    return Promise.resolve({
      reason: 'No reviewed delivery-proof malware scanner is configured.',
      status: 'UNAVAILABLE',
    });
  }
}
