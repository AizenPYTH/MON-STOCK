import type { Metadata } from "next";
import { SignupForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Créer un compte" };

export default function SignupPage() {
  return <SignupForm />;
}
