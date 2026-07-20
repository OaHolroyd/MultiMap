const OFFLINE_TILE_CACHE_UPDATED_MESSAGE = {
    type: 'offline-tile-cache-updated'
} as const;

interface ServiceWorkerOfflineConfigMessage {
    readonly type: 'offline-config-updated';
    readonly offlineMode: boolean;
    readonly tintOfflineTiles: boolean;
}

export async function notifyOfflineTileCacheUpdated(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage(OFFLINE_TILE_CACHE_UPDATED_MESSAGE);
    navigator.serviceWorker.controller?.postMessage(OFFLINE_TILE_CACHE_UPDATED_MESSAGE);
}

export async function syncOfflineServiceWorkerConfig(
    offlineMode: boolean,
    tintOfflineTiles: boolean
): Promise<void> {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    const message: ServiceWorkerOfflineConfigMessage = {
        type: 'offline-config-updated',
        offlineMode,
        tintOfflineTiles
    };

    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage(message);
    navigator.serviceWorker.controller?.postMessage(message);
}
