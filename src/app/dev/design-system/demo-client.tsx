"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { ToastProvider, useToast } from "@/components/ui/toast";

/** Démonstrations interactives du kit (développement uniquement). */
export function InteractiveDemo() {
  return (
    <ToastProvider>
      <Demo />
    </ToastProvider>
  );
}

function Demo() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Ouvrir une boîte de dialogue
      </Button>
      <Button variant="secondary" onClick={() => toast.success("Mouvement enregistré.")}>
        Toast succès
      </Button>
      <Button variant="secondary" onClick={() => toast.error("Erreur réseau : rien n'a été enregistré.")}>
        Toast erreur
      </Button>
      <Button variant="secondary" onClick={() => toast.info("Synchronisation eBay planifiée.")}>
        Toast info
      </Button>
      <Button
        loading={busy}
        loadingText="Enregistrement…"
        onClick={() => {
          setBusy(true);
          window.setTimeout(() => setBusy(false), 1800);
        }}
      >
        Action asynchrone
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Ajuster le stock"
        description="iPhone 13 128 Go Minuit · Grade A"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => setOpen(false)}>Enregistrer</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Quantité" htmlFor="dlg-qty" hint="Nombre d'unités à ajouter (négatif pour retirer).">
            <Input id="dlg-qty" inputMode="numeric" defaultValue="2" required />
          </Field>
          <Button variant="danger" size="sm">
            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            Supprimer la référence
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
