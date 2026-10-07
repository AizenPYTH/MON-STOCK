import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={next} initialError={error} />;
}
