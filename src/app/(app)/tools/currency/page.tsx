import type { Metadata } from "next";
import { rateAgeDays } from "@/domain/tools/currency";
import { requireOrgContext } from "@/features/auth/dal";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/page";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { fetchFxRates } from "@/features/tools/queries";
import { frDate, fxSourceText, toFrInput } from "@/features/tools/format";
import { readToolView, ToolPage } from "@/features/tools/components/tool-page";
import { CurrencyQuick } from "@/features/tools/components/quick-tools";
import { CurrencyDetail } from "@/features/tools/components/detail-tools";

export const metadata: Metadata = { title: "Convertisseur de devises" };

/** Devises : taux de référence BCE importés par le serveur (table `fx_rates`), date de chaque taux visible. */
export default async function CurrencyToolPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireOrgContext();
  const view = readToolView(await searchParams);
  const fx = await fetchFxRates(ctx);
  if ("error" in fx) {
    return (
      <ToolPage toolId="currency" view={view}>
        <Callout tone="danger" title="Taux de change indisponibles" action={<ButtonLink href={view === "detail" ? "/tools/currency?vue=detail" : "/tools/currency"} variant="secondary" size="sm">Réessayer</ButtonLink>}>
          {fx.error}
        </Callout>
      </ToolPage>
    );
  }
  const now = new Date();
  return (
    <ToolPage toolId="currency" view={view}>
      <div className="space-y-6">
        {view === "detail" ? (
          <CurrencyDetail rates={fx.rates} />
        ) : (
          <div className="max-w-3xl">
            <CurrencyQuick rates={fx.rates} />
          </div>
        )}
        {fx.rates.length > 0 ? (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-muted-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Taux de référence importés ({fx.rates.length} devises)</summary>
            <Card className="mt-3 overflow-hidden">
              <Table className="min-w-[480px]">
                <caption className="sr-only">Derniers taux de référence connus, pour 1 euro</caption>
                <THead>
                  <TR>
                    <TH scope="col">Devise</TH>
                    <TH scope="col" align="right">
                      Pour 1 €
                    </TH>
                    <TH scope="col">Date du taux</TH>
                    <TH scope="col">Source</TH>
                  </TR>
                </THead>
                <TBody>
                  {fx.rates.map((r) => {
                    const age = rateAgeDays(r.rateDate, now);
                    return (
                      <TR key={r.currency}>
                        <TD className="font-medium">{r.currency}</TD>
                        <TD align="right">{toFrInput(r.rate)}</TD>
                        <TD>
                          {frDate(r.rateDate)}
                          {age !== null && age > 4 ? <span className="ml-2 text-xs text-warning">il y a {age} j</span> : null}
                        </TD>
                        <TD>{fxSourceText(r.source)}</TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          </details>
        ) : null}
      </div>
    </ToolPage>
  );
}
