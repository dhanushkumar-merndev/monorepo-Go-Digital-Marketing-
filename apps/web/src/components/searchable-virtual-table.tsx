'use client';

import { Button } from '@gdm/ui/components/button';
import { Input } from '@gdm/ui/components/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDebouncedValue } from '@/features/analytics/use-debounced-value';

export interface VirtualTableColumn<T> {
  className?: string;
  header: string;
  id: string;
  render(item: T): ReactNode;
}

export function SearchableVirtualTable<T>({
  columns,
  emptyMessage,
  getKey,
  getSearchText,
  items,
  searchPlaceholder = 'Search…',
}: {
  columns: VirtualTableColumn<T>[];
  emptyMessage: string;
  getKey(item: T): string;
  getSearchText(item: T): string;
  items: T[];
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search.trim().toLocaleLowerCase(), 300);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const viewport = useRef<HTMLDivElement>(null);
  const filtered = useMemo(
    () =>
      query
        ? items.filter((item) => getSearchText(item).toLocaleLowerCase().includes(query))
        : items,
    [getSearchText, items, query],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  // TanStack Virtual intentionally exposes imperative measurement functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visible.length,
    estimateSize: () => 57,
    getScrollElement: () => viewport.current,
    overscan: 6,
  });
  const template = columns.map(() => 'minmax(0, 1fr)').join(' ');

  useEffect(() => setPage(1), [pageSize, query]);

  return (
    <div className="bg-card overflow-hidden rounded-xl border shadow-[var(--shadow-xs)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-3">
        <div className="relative w-full max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label={searchPlaceholder}
            className="pr-9 pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            value={search}
          />
          {search ? (
            <Button
              aria-label="Clear search"
              className="absolute top-0 right-0"
              onClick={() => setSearch('')}
              size="icon"
              variant="ghost"
            >
              <X />
            </Button>
          ) : null}
        </div>
        <p aria-live="polite" className="text-muted-foreground text-sm">
          {filtered.length} {filtered.length === 1 ? 'result' : 'results'}
        </p>
      </div>
      <div
        className="bg-muted/35 text-muted-foreground grid min-w-[44rem] border-b px-4 py-3 text-xs font-semibold tracking-wide uppercase"
        style={{ gridTemplateColumns: template }}
      >
        {columns.map((column) => (
          <span className={column.className} key={column.id}>
            {column.header}
          </span>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-muted-foreground p-8 text-center text-sm">{emptyMessage}</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto" ref={viewport}>
          <div className="relative min-w-[44rem]" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => {
              const item = visible[row.index];
              if (!item) return null;
              return (
                <div
                  className="hover:bg-muted/50 absolute top-0 left-0 grid w-full items-center border-b px-4 text-sm"
                  key={getKey(item)}
                  style={{
                    gridTemplateColumns: template,
                    height: row.size,
                    transform: `translateY(${String(row.start)}px)`,
                  }}
                >
                  {columns.map((column) => (
                    <div className={column.className} key={column.id}>
                      {column.render(item)}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <nav
        aria-label="Table pagination"
        className="flex flex-wrap items-center justify-between gap-3 border-t p-3"
      >
        <p className="text-muted-foreground text-sm">
          Page {safePage} of {pageCount}
        </p>
        <div className="flex items-center gap-2">
          <Select
            onValueChange={(value) => setPageSize(Number(value ?? 25))}
            value={String(pageSize)}
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
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
            size="icon"
            variant="outline"
          >
            <ChevronLeft />
          </Button>
          <Button
            aria-label="Next page"
            disabled={safePage === pageCount}
            onClick={() => setPage(safePage + 1)}
            size="icon"
            variant="outline"
          >
            <ChevronRight />
          </Button>
        </div>
      </nav>
    </div>
  );
}
