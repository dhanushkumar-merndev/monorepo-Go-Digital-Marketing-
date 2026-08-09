import { RegistrationDetail } from '@/features/registration/registration-detail';

export default async function RegistrationCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <RegistrationDetail caseId={caseId} />;
}
