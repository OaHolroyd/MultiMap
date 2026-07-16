import {
    getBaseRasterSources,
    getDefaultSettingsBaseSourceId,
    getOverlayRasterSources
} from '../map/sources';
import type { StorageMigrationResult } from '../storage/localStorage';

export const SETTINGS_STORAGE_KEY = 'multimap.settings';

export type SettingsPopoverTab = 'general' | 'layers' | 'routes' | 'downloads';

export interface AppSettings {
    readonly enabledBaseLayerIds: string[];
    readonly enabledOverlayIds: string[];
}

export function getDefaultSettings(): AppSettings {
    return {
        enabledBaseLayerIds: getBaseRasterSources().map((source) => source.id),
        enabledOverlayIds: getOverlayRasterSources().map((source) => source.id)
    };
}

export function cloneSettings(settings: AppSettings): AppSettings {
    return {
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

    // The layer picker expects at least one base layer to remain available, so
    // persisted settings are normalized to keep a valid fallback.
    const normalizedBaseLayerIds = enabledBaseLayerIds.length > 0
        ? enabledBaseLayerIds
        : [getDefaultSettingsBaseSourceId()];
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
