export function DemoBanner() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
      <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-xs font-semibold">DEMO</span>
      <span className="font-medium">Mode démonstration — données fictives.</span>
      <span className="text-amber-800">Aucun chiffre affiché ici ne provient d'une vraie marketplace ni d'un vrai fournisseur.</span>
    </div>
  );
}
