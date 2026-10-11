/**
 * Lecture vocale des réponses : voix du serveur (OpenAI) téléchargée UNE fois par réponse et par
 * voix (cache local), lecture unique (aucune superposition), arrêt immédiat, repli sur la voix de
 * l'appareil en cas d'échec. Modules natifs simulés : aucun audio réel n'est produit.
 */
const mockDownload = jest.fn();
const mockFiles = new Set<string>();
const mockPlayers: { src: unknown; cb: ((s: Record<string, unknown>) => void) | null; play: jest.Mock; pause: jest.Mock; remove: jest.Mock }[] = [];
const mockSpeak = jest.fn();

jest.mock("expo-file-system", () => {
  class Directory {
    exists = true;
    create() {}
    list() {
      return [];
    }
  }
  class File {
    static downloadFileAsync = (...a: unknown[]) => mockDownload(...a);
    name: string;
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.name = name;
      this.uri = `file:///cache/${name}`;
    }
    get exists() {
      return mockFiles.has(this.name);
    }
    get size() {
      return mockFiles.has(this.name) ? 1000 : 0;
    }
  }
  return { Directory, File, Paths: { cache: {} } };
});
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(async () => {}),
  createAudioPlayer: (src: unknown) => {
    const p = {
      src,
      cb: null as ((mockStatus: Record<string, unknown>) => void) | null,
      playing: false,
      play: jest.fn(() => setTimeout(() => p.cb?.({ playing: true, playbackState: "playing", didJustFinish: false }), 0)),
      pause: jest.fn(),
      remove: jest.fn(),
      addListener: (_e: string, cb: (mockStatus: Record<string, unknown>) => void) => {
        p.cb = cb;
        return { remove: jest.fn() };
      },
    };
    mockPlayers.push(p);
    return p;
  },
}));
jest.mock("expo-speech", () => ({ speak: (...a: unknown[]) => mockSpeak(...a), stop: jest.fn(async () => {}), getAvailableVoicesAsync: jest.fn(async () => []) }));
jest.mock("~/lib/api", () => ({ apiBaseUrl: () => "https://x.supabase.co/functions/v1/api", apiHeaders: jest.fn(async () => ({ Authorization: "Bearer t", "x-organization-id": "org-1" })) }));

import { playVoiceSample, speak, stopSpeaking } from "~/lib/tts";

const opts = { messageId: "m-1", organizationId: "org-1", serverVoice: true, voice: "cedar" };

beforeEach(async () => {
  await stopSpeaking();
  mockDownload.mockReset().mockImplementation(async (_url: string, file: { name: string }) => {
    mockFiles.add(file.name);
    return file;
  });
  mockFiles.clear();
  mockPlayers.length = 0;
  mockSpeak.mockReset();
});

describe("voix du serveur", () => {
  it("télécharge une seule fois par réponse et par voix, puis relit depuis le cache", async () => {
    const onStart = jest.fn();
    expect(await speak("Bonjour.", { onStart }, opts)).toBe(true);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    const [url, , dl] = mockDownload.mock.calls[0] as [string, unknown, { headers: Record<string, string> }];
    expect(url).toBe("https://x.supabase.co/functions/v1/api/advisor/speech?messageId=m-1&voice=cedar");
    expect(dl.headers.Authorization).toBe("Bearer t");
    expect(onStart).toHaveBeenCalled();
    expect(mockPlayers[0]!.src).toEqual({ uri: "file:///cache/m-1-cedar.mp3" });
    // relecture : aucune nouvelle synthèse
    expect(await speak("Bonjour.", {}, opts)).toBe(true);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("fin de lecture → onDone ; arrêt → onStopped et lecteur libéré", async () => {
    const onDone = jest.fn();
    await speak("x", { onDone }, opts);
    mockPlayers[0]!.cb?.({ playing: false, didJustFinish: true, playbackState: "ended" });
    expect(onDone).toHaveBeenCalled();
    const onStopped = jest.fn();
    await speak("x", { onStopped }, opts);
    await stopSpeaking();
    expect(onStopped).toHaveBeenCalled();
    expect(mockPlayers[1]!.remove).toHaveBeenCalled();
  });

  it("aucune superposition : une nouvelle lecture libère la précédente", async () => {
    await speak("un", {}, opts);
    await speak("deux", {}, { ...opts, messageId: "m-2" });
    expect(mockPlayers).toHaveLength(2);
    expect(mockPlayers[0]!.remove).toHaveBeenCalled();
    expect(mockPlayers[1]!.remove).not.toHaveBeenCalled();
  });

  it("échec du serveur (HTTP ≠ 2xx) → voix de l'appareil", async () => {
    mockDownload.mockRejectedValueOnce(new Error("UnableToDownload: 500"));
    expect(await speak("Votre CA est de 830 €.", {}, opts)).toBe(true);
    expect(mockPlayers).toHaveLength(0);
    expect(mockSpeak).toHaveBeenCalled();
    expect(mockSpeak.mock.calls[0]![0]).toContain("830 euros");
  });

  it("arrêt pendant le téléchargement : rien n'est lu, ni serveur ni appareil", async () => {
    let release: (v: unknown) => void = () => {};
    mockDownload.mockImplementationOnce((_u: string, file: { name: string }) => new Promise((r) => (release = () => r(file))));
    const p = speak("x", {}, opts);
    await new Promise((r) => setTimeout(r, 0));
    await stopSpeaking();
    release(undefined);
    expect(await p).toBe(false);
    expect(mockPlayers).toHaveLength(0);
    expect(mockSpeak).not.toHaveBeenCalled();
  });

  it("sans voix serveur annoncée : voix de l'appareil, aucun téléchargement", async () => {
    await speak("Bonjour.", {}, { ...opts, serverVoice: false });
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockSpeak).toHaveBeenCalled();
  });
});

describe("échantillon de comparaison", () => {
  it("même échantillon mis en cache par voix ; erreur signalée", async () => {
    await playVoiceSample("marin", "org-1");
    await playVoiceSample("marin", "org-1");
    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload.mock.calls[0]![0]).toBe("https://x.supabase.co/functions/v1/api/advisor/voice-sample?voice=marin");
    mockDownload.mockRejectedValueOnce(new Error("UnableToDownload: 429"));
    const onError = jest.fn();
    expect(await playVoiceSample("cedar", "org-1", { onError })).toBe(false);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/indisponible/));
  });
});
