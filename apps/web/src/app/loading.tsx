import { Card, CardContent, CardHeader } from '@gdm/ui/components/card';
import { Skeleton } from '@gdm/ui/components/skeleton';

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full max-w-2xl" />
        <Skeleton className="h-5 w-full max-w-3xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <Card key={index}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
