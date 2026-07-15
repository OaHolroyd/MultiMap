import {
    DEFAULT_RASTER_SOURCE,
    SOURCES_RASTER,
    SOURCES_RASTER_OVERLAYS
} from '../map/sources';

export const SETTINGS_STORAGE_KEY = 'multimap.settings';

export type SettingsPopoverTab = 'general' | 'layers' | 'routes' | 'downloads';

export interface AppSettings {
    readonly enabledBaseLayerIds: string[];
    readonly enabledOverlayIds: string[];
}

export interface MigratedSettingsResult {
    readonly data: AppSettings;
    readonly didChange: boolean;
}

const DEFAULT_BASE_LAYER_IDS = SOURCES_RASTER.map((source) => source.id);
const DEFAULT_OVERLAY_IDS = SOURCES_RASTER_OVERLAYS.map((source) => source.id);

export const DEFAULT_SETTINGS: AppSettings = {
    enabledBaseLayerIds: [...DEFAULT_BASE_LAYER_IDS],
    enabledOverlayIds: [...DEFAULT_OVERLAY_IDS]
};

export function cloneSettings(settings: AppSettings): AppSettings {
    return {
        enabledBaseLayerIds: [...settings.enabledBaseLayerIds],
        enabledOverlayIds: [...settings.enabledOverlayIds]
    };
}

export function migrateStorageShape(savedData: unknown): MigratedSettingsResult {
    const defaultSettings = cloneSettings(DEFAULT_SETTINGS);

    if (!isObject(savedData)) {
        return {
            data: defaultSettings,
            didChange: savedData !== null && savedData !== undefined
        };
    }

    const enabledBaseLayerIds = filterKnownIds(
        savedData.enabledBaseLayerIds,
        DEFAULT_BASE_LAYER_IDS
    );
    const enabledOverlayIds = filterKnownIds(
        savedData.enabledOverlayIds,
        DEFAULT_OVERLAY_IDS
    );

    // The layer picker expects at least one base layer to remain available, so
    // persisted settings are normalized to keep a valid fallback.
    const normalizedBaseLayerIds = enabledBaseLayerIds.length > 0
        ? enabledBaseLayerIds
        : [DEFAULT_RASTER_SOURCE.id];
    const normalizedOverlayIds = enabledOverlayIds;

    const normalizedSettings: AppSettings = {
        enabledBaseLayerIds: normalizedBaseLayerIds,
        enabledOverlayIds: normalizedOverlayIds
    };

    const didChange = !arraysEqual(
        enabledBaseLayerIds,
        normalizedBaseLayerIds
    ) || !arraysEqual(enabledOverlayIds, normalizedOverlayIds);

    return {
        data: normalizedSettings,
        didChange
    };
}

export function getInitialBaseLayerId(settings: AppSettings): string {
    return settings.enabledBaseLayerIds[0] ?? DEFAULT_RASTER_SOURCE.id;
}

function filterKnownIds(
    candidateIds: unknown,
    knownIds: readonly string[]
): string[] {
    if (!Array.isArray(candidateIds)) {
        return [];
    }

    const validIds = new Set(knownIds);
    const uniqueIds = new Set<string>();

    candidateIds.forEach((id) => {
        if (typeof id === 'string' && validIds.has(id)) {
            uniqueIds.add(id);
        }
    });

    return [...uniqueIds];
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}
