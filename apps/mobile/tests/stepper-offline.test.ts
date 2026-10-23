/**
 * M-04 : file du stepper (taps pendant une requête en vol ni perdus ni doublés, envois sérialisés,
 * échec = abandon, fermeture = envoi immédiat). M-03 / M-14 : écritures jamais mises en pause
 * puis rejouées hors ligne ; pas de nouvel essai sur une erreur métier.
 */
import { onlineManager, QueryClient } from "@tanstack/react-query";
import { StepperQueue, type StepperQueueState } from "~/hooks/stepper-queue";
import { createQueryClient, shouldRetryQuery } from "~/lib/query-client";

jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => undefined }));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const sent: number[] = [];
  const pendingSends: ReturnType<typeof deferred<number | null>>[] = [];
  const confirmed: [number | null, number][] = [];
  const errors: unknown[] = [];
  const states: StepperQueueState[] = [];
  const q = new StepperQueue({
    delayMs: 700,
    send: (delta) => {
      sent.push(delta);
      const d = deferred<number | null>();
      pendingSends.push(d);
      return d.promise;
    },
    onConfirmed: (after, delta) => confirmed.push([after, delta]),
    onError: (e) => errors.push(e),
    onState: (s) => states.push(s),
  });
  return { q, sent, pendingSends, confirmed, errors, states };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

describe("StepperQueue (M-04)", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("une rafale de taps → UN mouvement, après 700 ms sans tap", async () => {
    const t = setup();
    t.q.tap(1);
    t.q.tap(1);
    jest.advanceTimersByTime(500);
    t.q.tap(1);
    jest.advanceTimersByTime(699);
    expect(t.sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(t.sent).toEqual([3]);
    expect(t.q.state()).toEqual({ pending: 0, inFlight: 3 });
  });

  it("taps pendant une requête en vol : ni perdus si la réponse arrive vite, ni renvoyés en double", async () => {
    const t = setup();
    t.q.tap(2);
    jest.advanceTimersByTime(700);
    expect(t.sent).toEqual([2]);
    // nouveaux taps pendant l'envoi
    t.q.tap(1);
    t.q.tap(1);
    expect(t.q.state()).toEqual({ pending: 2, inFlight: 2 });
    // (a) la réponse arrive AVANT la fin du nouveau délai : les 2 taps restent en attente
    t.pendingSends[0]!.resolve(12);
    await flush();
    expect(t.confirmed).toEqual([[12, 2]]);
    expect(t.q.state()).toEqual({ pending: 2, inFlight: 0 });
    jest.advanceTimersByTime(700);
    expect(t.sent).toEqual([2, 2]);
  });

  it("le délai expire pendant l'envoi : le second envoi attend la fin du premier (sérialisé), sans recompter", async () => {
    const t = setup();
    t.q.tap(1);
    jest.advanceTimersByTime(700);
    t.q.tap(-1);
    t.q.tap(-1);
    jest.advanceTimersByTime(5_000);
    expect(t.sent).toEqual([1]); // jamais deux requêtes simultanées
    t.pendingSends[0]!.resolve(5);
    await flush();
    jest.advanceTimersByTime(700);
    expect(t.sent).toEqual([1, -2]);
    expect(t.sent.reduce((a, b) => a + b, 0)).toBe(-1); // somme exacte des taps
  });

  it("échec : tout ce qui n'est pas confirmé est abandonné et signalé, aucun nouvel essai", async () => {
    const t = setup();
    t.q.tap(1);
    jest.advanceTimersByTime(700);
    t.q.tap(1);
    t.pendingSends[0]!.reject(new Error("Stock insuffisant"));
    await flush();
    expect(t.errors).toHaveLength(1);
    expect(t.q.state()).toEqual({ pending: 0, inFlight: 0 });
    jest.advanceTimersByTime(10_000);
    expect(t.sent).toEqual([1]);
  });

  it("fermeture de l'écran : les derniers taps partent tout de suite, plus aucun tap accepté ensuite", async () => {
    const t = setup();
    t.q.tap(1);
    t.q.flushNow();
    t.q.dispose();
    expect(t.sent).toEqual([1]);
    t.q.tap(5);
    expect(t.q.state().pending).toBe(0);
  });
});

describe("écritures hors ligne (M-03)", () => {
  afterEach(() => onlineManager.setOnline(true));

  it("une mutation lancée hors ligne s'exécute immédiatement (échec explicite), elle n'est jamais mise en pause puis rejouée", async () => {
    const client = createQueryClient();
    expect(client.getDefaultOptions().mutations?.networkMode).toBe("always");
    onlineManager.setOnline(false);
    const fn = jest.fn(async () => {
      throw Object.assign(new Error("Network request failed"), { code: "OFFLINE" });
    });
    const mutation = client.getMutationCache().build(client, { mutationFn: fn, gcTime: 0 });
    await expect(mutation.execute(undefined)).rejects.toThrow("Network request failed");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(mutation.state.isPaused).toBe(false);
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    expect(fn).toHaveBeenCalledTimes(1); // rien n'est rejoué au retour du réseau
    client.clear();
  });

  it("témoin : avec l'ancien réglage « online », la mutation était mise en pause (puis rejouée)", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { networkMode: "online" } } });
    onlineManager.setOnline(false);
    const fn = jest.fn(async () => "ok");
    const mutation = client.getMutationCache().build(client, { mutationFn: fn, gcTime: 0 });
    const run = mutation.execute(undefined);
    await Promise.resolve();
    expect(fn).not.toHaveBeenCalled();
    onlineManager.setOnline(true);
    await client.resumePausedMutations();
    await run;
    expect(fn).toHaveBeenCalledTimes(1);
    client.clear();
  });
});

describe("nouvelles tentatives des lectures (M-14)", () => {
  it("jamais sur une erreur métier ou un délai dépassé ; 2 au plus sur une panne passagère", () => {
    for (const code of ["FORBIDDEN", "VALIDATION", "TIMEOUT", "AUTH_REQUIRED", "NOT_FOUND", "OFFLINE", "42501", "PGRST301"]) expect(shouldRetryQuery(0, { code })).toBe(false);
    expect(shouldRetryQuery(0, { code: "SERVER" })).toBe(true);
    expect(shouldRetryQuery(1, new Error("fetch failed"))).toBe(true);
    expect(shouldRetryQuery(2, { code: "SERVER" })).toBe(false);
  });
});
