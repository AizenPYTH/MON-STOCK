import { useSyncExternalStore } from "react";
import { onlineManager } from "@tanstack/react-query";

/** État réseau (NetInfo, via onlineManager branché dans query-client.ts). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}
