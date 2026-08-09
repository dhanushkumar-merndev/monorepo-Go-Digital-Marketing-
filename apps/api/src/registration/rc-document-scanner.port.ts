import { Injectable } from '@nestjs/common';

export const RC_DOCUMENT_SCANNER = Symbol('RC_DOCUMENT_SCANNER');

export interface RcDocumentScanResult {
  reason: string;
  status: 'CLEAN' | 'REJECTED' | 'UNAVAILABLE';
}

export interface RcDocumentScanner {
  scan(input: { contentType: string; objectKey: string }): Promise<RcDocumentScanResult>;
}

@Injectable()
export class FailClosedRcDocumentScanner implements RcDocumentScanner {
  scan(): Promise<RcDocumentScanResult> {
    return Promise.resolve({
      reason: 'No reviewed RC-document malware scanner is configured.',
      status: 'UNAVAILABLE',
    });
  }
}
