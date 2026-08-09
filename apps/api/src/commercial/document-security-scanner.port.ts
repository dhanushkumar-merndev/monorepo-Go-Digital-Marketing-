export const DOCUMENT_SECURITY_SCANNER = Symbol('DOCUMENT_SECURITY_SCANNER');

export interface DocumentScanRequest {
  checksumSha256?: string;
  contentLength: number;
  contentType: string;
  objectKey: string;
}

export interface DocumentSecurityScanner {
  scan(request: DocumentScanRequest): Promise<'CLEAN' | 'REJECTED' | 'UNAVAILABLE'>;
}

/** Production-safe default until a tenant-approved malware scanner adapter is configured. */
export class FailClosedDocumentSecurityScanner implements DocumentSecurityScanner {
  scan(): Promise<'UNAVAILABLE'> {
    return Promise.resolve('UNAVAILABLE');
  }
}
