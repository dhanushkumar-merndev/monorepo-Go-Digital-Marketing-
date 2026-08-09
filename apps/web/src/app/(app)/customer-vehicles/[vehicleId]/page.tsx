import { CustomerVehicleDetail } from '@/features/registration/customer-vehicle-detail';

export default async function CustomerVehiclePage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  return <CustomerVehicleDetail vehicleId={vehicleId} />;
}
