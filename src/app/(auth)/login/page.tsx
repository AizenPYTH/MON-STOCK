import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components";
import { loginErrorMessage } from "@/features/auth/messages";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  // `error` est un code : seul un message connu est affiché.
  return <LoginForm next={next} initialError={loginErrorMessage(error)} />;
}
