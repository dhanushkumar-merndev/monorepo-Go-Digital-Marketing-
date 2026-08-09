import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { API_ENVIRONMENT } from '../../config/api-config.module.js';
import type {
  ObjectStorage,
  PutPrivateObjectRequest,
  PresignedObjectUrl,
  PresignDownloadRequest,
  PresignUploadRequest,
  StoredObjectMetadata,
} from './object-storage.port.js';

const DEFAULT_PRESIGN_SECONDS = 300;
const MIN_PRESIGN_SECONDS = 30;
const MAX_PRESIGN_SECONDS = 900;
const SAFE_OBJECT_KEY = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\\\r\n]{1,1024}$/;

function validateObjectKey(key: string): string {
  if (!SAFE_OBJECT_KEY.test(key)) {
    throw new Error('Object key is invalid.');
  }

  return key;
}

function expiresInSeconds(value?: number): number {
  const seconds = value ?? DEFAULT_PRESIGN_SECONDS;

  if (
    !Number.isInteger(seconds) ||
    seconds < MIN_PRESIGN_SECONDS ||
    seconds > MAX_PRESIGN_SECONDS
  ) {
    throw new Error(
      `Presigned URL expiry must be between ${MIN_PRESIGN_SECONDS} and ${MAX_PRESIGN_SECONDS} seconds.`,
    );
  }

  return seconds;
}

function safeDownloadName(value: string): string {
  const sanitized = value.replace(/["\\\r\n]/g, '_').trim();

  if (!sanitized || sanitized.length > 180) {
    throw new Error('Download file name is invalid.');
  }

  return sanitized;
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };

  return (
    candidate.name === 'NotFound' ||
    candidate.name === 'NoSuchKey' ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

@Injectable()
export class S3ObjectStorageAdapter implements ObjectStorage, OnApplicationShutdown {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(@Inject(API_ENVIRONMENT) environment: ApiEnvironment) {
    this.bucket = environment.s3Bucket;

    const config: S3ClientConfig = {
      forcePathStyle: environment.s3ForcePathStyle,
      region: environment.s3Region,
      ...(environment.s3Endpoint ? { endpoint: environment.s3Endpoint } : {}),
      ...(environment.s3AccessKeyId && environment.s3SecretAccessKey
        ? {
            credentials: {
              accessKeyId: environment.s3AccessKeyId,
              secretAccessKey: environment.s3SecretAccessKey,
            },
          }
        : {}),
    };

    this.client = new S3Client(config);
  }

  async createUploadUrl(request: PresignUploadRequest): Promise<PresignedObjectUrl> {
    const key = validateObjectKey(request.key);
    const expiresIn = expiresInSeconds(request.expiresInSeconds);
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: request.contentType,
      ...(request.contentLength === undefined ? {} : { ContentLength: request.contentLength }),
      ...(request.checksumSha256 === undefined ? {} : { ChecksumSHA256: request.checksumSha256 }),
    });

    return {
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      method: 'PUT',
      url: await getSignedUrl(this.client, command, { expiresIn }),
    };
  }

  async deletePrivateObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: validateObjectKey(key) }),
    );
  }

  async putPrivateObject(request: PutPrivateObjectRequest): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: request.body,
        Bucket: this.bucket,
        ContentType: request.contentType,
        Key: validateObjectKey(request.key),
      }),
    );
  }

  async createDownloadUrl(request: PresignDownloadRequest): Promise<PresignedObjectUrl> {
    const key = validateObjectKey(request.key);
    const expiresIn = expiresInSeconds(request.expiresInSeconds);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ...(request.downloadFileName
        ? {
            ResponseContentDisposition: `attachment; filename="${safeDownloadName(request.downloadFileName)}"`,
          }
        : {}),
    });

    return {
      expiresAt: new Date(Date.now() + expiresIn * 1_000).toISOString(),
      method: 'GET',
      url: await getSignedUrl(this.client, command, { expiresIn }),
    };
  }

  async stat(key: string): Promise<StoredObjectMetadata | undefined> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: validateObjectKey(key),
        }),
      );

      return {
        ...(result.ChecksumSHA256 === undefined ? {} : { checksumSha256: result.ChecksumSHA256 }),
        ...(result.ContentLength === undefined ? {} : { contentLength: result.ContentLength }),
        ...(result.ContentType === undefined ? {} : { contentType: result.ContentType }),
        ...(result.ETag === undefined ? {} : { etag: result.ETag }),
        ...(result.LastModified === undefined
          ? {}
          : { lastModified: result.LastModified.toISOString() }),
      };
    } catch (error) {
      if (isNotFound(error)) {
        return undefined;
      }

      throw error;
    }
  }

  onApplicationShutdown(): void {
    this.client.destroy();
  }
}
