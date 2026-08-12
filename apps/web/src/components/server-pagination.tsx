'use client';

import { Button } from '@gdm/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PageMetadata {
  has_next: boolean;
  page: number;
  page_size: number;
}

export function ServerPagination({
  metadata,
  onPage,
  onPageSize,
}: {
  metadata: PageMetadata;
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
}) {
  return (
    <nav
      aria-label="Pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
    >
      <p aria-live="polite" className="text-muted-foreground text-sm">
        Page {metadata.page}
      </p>
      <div className="flex items-center gap-2">
        <Select
          onValueChange={(value) => onPageSize(Number(value ?? 25))}
          value={String(metadata.page_size)}
        >
          <SelectTrigger aria-label="Rows per page" className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[25, 50, 100].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          aria-label="Previous page"
          disabled={metadata.page <= 1}
          onClick={() => onPage(metadata.page - 1)}
          size="sm"
          variant="outline"
        >
          <ChevronLeft />
          Previous
        </Button>
        <Button
          aria-label="Next page"
          disabled={!metadata.has_next}
          onClick={() => onPage(metadata.page + 1)}
          size="sm"
          variant="outline"
        >
          Next
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}

export function defaultPageMetadata(page: number, pageSize: number): PageMetadata {
  return { has_next: false, page, page_size: pageSize };
}

export function readPageParameters(params: { get(name: string): string | null }): {
  page: number;
  pageSize: number;
} {
  const page = Number(params.get('page'));
  const size = Number(params.get('page_size'));
  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: [25, 50, 100].includes(size) ? size : 25,
  };
}
