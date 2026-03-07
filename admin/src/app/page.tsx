import { redirect } from 'next/navigation';

/** Page racine : redirige vers /dashboard ou /login selon l'auth */
export default function Home() {
  redirect('/dashboard');
}
