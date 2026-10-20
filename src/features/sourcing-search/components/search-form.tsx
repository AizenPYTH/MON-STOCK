import Form from "next/form";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";

/** Champ de recherche fournisseurs (GET /sourcing?q=…, navigation côté client). */
export function SupplierSearchForm({ query }: { query: string }) {
  return (
    <Form action="/sourcing" className="rounded-xl border border-border bg-surface p-4" role="search" aria-label="Rechercher chez les fournisseurs">
      <label htmlFor="supplier-q" className="mb-1.5 block text-sm font-medium text-foreground">
        Produit recherché
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="supplier-q" name="q" defaultValue={query} placeholder="Ex. iPhone 13, écran, batterie…" className="h-11 flex-1 text-base" minLength={2} maxLength={120} required autoComplete="off" autoFocus={!query} />
        <Button type="submit" size="lg" className="h-11">
          <Search className="h-4 w-4" aria-hidden="true" /> Chercher
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">Vos fournisseurs sont interrogés en direct (jusqu&apos;à ~35 s), puis les offres enregistrées qui contiennent tous les mots sont comparées.</p>
    </Form>
  );
}
