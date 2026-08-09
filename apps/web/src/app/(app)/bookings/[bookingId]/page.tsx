import { CommercialBookingDetail } from '@/features/commercial/commercial-booking-detail';

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <CommercialBookingDetail bookingId={bookingId} />;
}
