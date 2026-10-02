import { Skeleton } from "@/app/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto max-w-5xl space-y-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-28 w-full" /><Skeleton className="h-80 w-full" /></div>;
}
