import { buttonVariants } from '@gdm/ui/components/button';
import { ArrowLeft, FileQuestion } from 'lucide-react';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center py-16 text-center">
      <span className="bg-muted text-muted-foreground grid size-12 place-items-center rounded-full">
        <FileQuestion aria-hidden="true" className="size-6" />
      </span>
      <p className="text-primary mt-5 text-sm font-semibold">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-6">
        This route is not part of the current application phase, or it may have moved.
      </p>
      <Link className={buttonVariants({ className: 'mt-6' })} href="/">
        <ArrowLeft aria-hidden="true" data-icon="inline-start" />
        Return to overview
      </Link>
    </div>
  );
}
