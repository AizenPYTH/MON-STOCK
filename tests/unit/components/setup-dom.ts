/**
 * Tests de composants (W-16) : environnement happy-dom déclaré par fichier
 * (`// @vitest-environment happy-dom`). Nettoyage du DOM après chaque test et drapeau `act` de React.
 */
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
});
