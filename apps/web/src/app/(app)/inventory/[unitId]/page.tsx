import { InventoryUnitDetailView } from '@/features/inventory/inventory-unit-detail';

export default async function InventoryUnitPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  return <InventoryUnitDetailView unitId={unitId} />;
}
