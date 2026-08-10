import { redirect } from 'next/navigation';

export default function AuthenticationMethodsPage() {
  redirect('/?settings=methods');
}
