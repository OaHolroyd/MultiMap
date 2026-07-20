import {
    getBaseRasterSources,
    getDefaultSettingsBaseSourceId,
    getOverlayRasterSources
} from '../map/sources';
import type { StorageMigrationResult } from '../storage/localStorage';

export const SETTINGS_STORAGE_KEY = 'multimap.settings';

export type SettingsPopoverTab = 'general' | 'layers' | 'routes' | 'downloads';
export type AppTheme = 'dark' | 'light';

export interface AppSettings {
    readonly theme: AppTheme;
    readonly offlineMode: boolean;
    readonly tintOfflineTiles: boolean;
    readonly enabledBaseLayerIds: string[];
    readonly enabledOverlayIds: string[];
}

export function getDefaultSettings(): AppSettings {
    return {
        theme: 'dark',
        offlineMode: false,
        tintOfflineTiles: false,
        enabledBaseLayerIds: getBaseRasterSources().map((source) => source.id),
        enabledOverlayIds: getOverlayRasterSources().map((source) => source.id)
    };
}

export function cloneSettings(settings: AppSettings): AppSettings {
    return {
        theme: settings.theme,
        offlineMode: settings.offlineMode,
        tintOfflineTiles: settings.tintOfflineTiles,
        enabledBaseLayerIds: [...settings.enabledBaseLayerIds],
        enabledOverlayIds: [...settings.enabledOverlayIds]
    };
}

export function migrateStorageShape(savedData: unknown): StorageMigrationResult<AppSettings> {
    const defaultSettings = cloneSettings(getDefaultSettings());

    if (!isObject(savedData)) {
        return {
            data: defaultSettings,
            didChange: savedData !== null && savedData !== undefined
        };
    }

    const defaultBaseLayerIds = getBaseRasterSources().map((source) => source.id);
    const defaultOverlayIds = getOverlayRasterSources().map((source) => source.id);

    const enabledBaseLayerIds = filterKnownIds(
        savedData.enabledBaseLayerIds,
        defaultBaseLayerIds
    );
    const enabledOverlayIds = filterKnownIds(
        savedData.enabledOverlayIds,
        defaultOverlayIds
    );
    const theme = normalizeTheme(savedData.theme);
    const offlineMode = savedData.offlineMode === true;
    const tintOfflineTiles = savedData.tintOfflineTiles === true;

    // The layer picker expects at least one base layer to remain available, so
    // persisted settings are normalized to keep a valid fallback.
    const normalizedBaseLayerIds = enabledBaseLayerIds.length > 0
        ? enabledBaseLayerIds
        : [getDefaultSettingsBaseSourceId()];
    const normalizedOverlayIds = enabledOverlayIds;

    const normalizedSettings: AppSettings = {
        theme,
        offlineMode,
        tintOfflineTiles,
        enabledBaseLayerIds: normalizedBaseLayerIds,
        enabledOverlayIds: normalizedOverlayIds
    };

    const didChange = theme !== savedData.theme
        || offlineMode !== savedData.offlineMode
        || tintOfflineTiles !== savedData.tintOfflineTiles
        || !arraysEqual(enabledBaseLayerIds, normalizedBaseLayerIds)
        || !arraysEqual(enabledOverlayIds, normalizedOverlayIds);

    return {
        data: normalizedSettings,
        didChange
    };
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

function normalizeTheme(candidateTheme: unknown): AppTheme {
    return candidateTheme === 'light' ? 'light' : 'dark';
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
