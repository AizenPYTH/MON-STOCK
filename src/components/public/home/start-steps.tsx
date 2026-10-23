import { Accent } from "@/components/marketing/serif-accent";

const STEPS = [
  { title: "Créez votre compte", text: "Un e-mail et un mot de passe. Aucune carte bancaire n'est demandée." },
  { title: "Votre organisation", text: "Votre boutique, ou une organisation de démonstration aux données fictives, marquée « DÉMO » sur chaque écran." },
  { title: "Connectez eBay", text: "Par l'autorisation officielle eBay (OAuth) : aucun mot de passe eBay n'est demandé ni stocké. Vous pouvez aussi passer cette étape." },
  { title: "Ajoutez vos références", text: "Importez un catalogue (CSV, Excel, XML, JSON) ou saisissez vos produits. Les commandes eBay arrivent à chaque synchronisation." },
] as const;

/**
 * Démarrer (handoff v2 §C.8, `StepList`) : 4 étapes réelles, grands numéros serif (110 / 72),
 * ligne de progression au défilement ≥ 1100 px (les 4 étapes y sont sur une rangée ; en tablette, 2 × 2) (scaleX, piloté par <ScrollScenes> ; pleine sous
 * « réduire les animations »).
 */
export function StartSteps() {
  return (
    <section id="demarrer" aria-labelledby="demarrer-titre" className="scroll-mt-20 bg-paper-marketing">
      <div className="mx-auto w-full max-w-[1352px] px-[18px] py-20 min-[760px]:px-8 min-[760px]:py-28 min-[1100px]:px-14 min-[1100px]:py-36">
        <p data-r="" className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-[#5B6676]">Démarrer</p>
        <h2 id="demarrer-titre" data-r="" style={{ "--d": "80ms" } as React.CSSProperties} className="mt-4 max-w-[900px] text-[38px] font-extrabold leading-none tracking-[-0.045em] text-night min-[760px]:text-[56px] min-[1100px]:text-[76px]">
          Quatre étapes, <Accent>pas de détour.</Accent>
        </h2>
        <div data-scene="line" className="relative mt-14 min-[760px]:mt-20">
          <div aria-hidden="true" className="absolute inset-x-0 top-[116px] hidden h-[2px] bg-paper-marketing-rule-strong min-[1100px]:block">
            <span data-line-fill="" className="block h-full origin-left bg-night [transform:scaleX(0)] motion-reduce:[transform:none]" />
          </div>
          <ol className="grid gap-10 min-[760px]:grid-cols-2 min-[760px]:gap-x-8 min-[1100px]:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} data-r="" style={{ "--d": `${i * 90}ms` } as React.CSSProperties} className="relative">
                <span aria-hidden="true" className="block font-serif text-[72px] italic leading-[0.9] text-night min-[1100px]:text-[110px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span aria-hidden="true" className="relative z-10 mt-3 hidden h-3 w-3 rounded-full border-2 border-night bg-paper-marketing min-[1100px]:block" />
                <h3 className="mt-4 text-[22px] font-extrabold tracking-[-0.02em] text-night">
                  <span className="sr-only">Étape {i + 1} : </span>
                  {s.title}
                </h3>
                <p className="mt-2 max-w-[300px] text-[15.5px] font-medium leading-[1.55] text-[#5B6676]">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
