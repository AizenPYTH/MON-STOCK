import type { Metadata } from "next";
import { SignupForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SignupForm next={next} />;
}
