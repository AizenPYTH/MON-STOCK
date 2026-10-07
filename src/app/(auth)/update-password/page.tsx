import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/features/auth/components";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default function UpdatePasswordPage() {
  return <UpdatePasswordForm />;
}
