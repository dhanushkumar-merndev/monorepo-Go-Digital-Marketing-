export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignedObjectUrl {
  expiresAt: string;
  method: 'GET' | 'PUT';
  url: string;
}

export interface PresignUploadRequest {
  key: string;
  contentType: string;
  contentLength?: number;
  checksumSha256?: string;
  expiresInSeconds?: number;
}

export interface PresignDownloadRequest {
  key: string;
  downloadFileName?: string;
  expiresInSeconds?: number;
}

export interface StoredObjectMetadata {
  checksumSha256?: string;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: string;
}

/** Provider-neutral private object storage contract. */
export interface ObjectStorage {
  createUploadUrl(request: PresignUploadRequest): Promise<PresignedObjectUrl>;
  createDownloadUrl(request: PresignDownloadRequest): Promise<PresignedObjectUrl>;
  stat(key: string): Promise<StoredObjectMetadata | undefined>;
}
