import { z } from 'zod';

export const pageSizeSchema = z.coerce
  .number()
  .int()
  .refine((value) => [25, 50, 100].includes(value), {
    message: 'page size must be 25, 50, or 100',
  })
  .default(25);

export const pageQueryFields = {
  limit: pageSizeSchema,
  page: z.coerce.number().int().min(1).default(1),
} as const;

export const pageMetadataSchema = z.object({
  has_next: z.boolean(),
  page: z.number().int().min(1),
  page_size: z
    .number()
    .int()
    .refine((value) => [25, 50, 100].includes(value)),
});

export type PageMetadata = z.infer<typeof pageMetadataSchema>;
