import { TestRideDetailView } from '@/features/test-rides/test-ride-detail';

export default async function TestRideDetailPage({
  params,
}: {
  params: Promise<{ rideId: string }>;
}) {
  const { rideId } = await params;
  return <TestRideDetailView rideId={rideId} />;
}
