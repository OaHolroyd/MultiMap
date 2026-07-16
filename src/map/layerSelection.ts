import {
    getBaseRasterSources,
    getDefaultSettingsBaseSourceId,
    getOverlayRasterSources
} from './sources';
import type { AppSettings } from '../settings/settings';
import type { StorageMigrationResult } from '../storage/localStorage';

export const LAYER_SELECTION_STORAGE_KEY = 'multimap.layer-selection';

export interface LayerSelectionState {
    readonly activeBaseLayerId: string;
    readonly activeOverlayIds: string[];
}

export function cloneLayerSelection(selection: LayerSelectionState): LayerSelectionState {
    return {
        activeBaseLayerId: selection.activeBaseLayerId,
        activeOverlayIds: [...selection.activeOverlayIds]
    };
}

export function getDefaultLayerSelection(settings: AppSettings): LayerSelectionState {
    return {
        activeBaseLayerId: settings.enabledBaseLayerIds[0] ?? getDefaultSettingsBaseSourceId(),
        activeOverlayIds: []
    };
}

export function migrateLayerSelection(
    savedData: unknown,
    settings: AppSettings
): StorageMigrationResult<LayerSelectionState> {
    const fallbackSelection = getDefaultLayerSelection(settings);

    if (!isObject(savedData)) {
        return {
            data: fallbackSelection,
            didChange: savedData !== null && savedData !== undefined
        };
    }

    const enabledBaseLayerIds = new Set(settings.enabledBaseLayerIds);
    const enabledOverlayIds = new Set(settings.enabledOverlayIds);
    const knownBaseLayerIds = getBaseRasterSources().map((source) => source.id);
    const knownOverlayIds = getOverlayRasterSources().map((source) => source.id);

    const normalizedBaseLayerId = typeof savedData.activeBaseLayerId === 'string' &&
        knownBaseLayerIds.includes(savedData.activeBaseLayerId) &&
        enabledBaseLayerIds.has(savedData.activeBaseLayerId)
        ? savedData.activeBaseLayerId
        : fallbackSelection.activeBaseLayerId;

    const normalizedOverlayIds = filterKnownIds(
        savedData.activeOverlayIds,
        knownOverlayIds
    ).filter((sourceId) => enabledOverlayIds.has(sourceId));

    const normalizedSelection: LayerSelectionState = {
        activeBaseLayerId: normalizedBaseLayerId,
        activeOverlayIds: normalizedOverlayIds
    };

    const didChange = normalizedBaseLayerId !== savedData.activeBaseLayerId ||
        !arraysEqual(normalizedOverlayIds, Array.isArray(savedData.activeOverlayIds) ? savedData.activeOverlayIds : []);

    return {
        data: normalizedSelection,
        didChange
    };
}

function filterKnownIds(candidateIds: unknown, knownIds: readonly string[]): string[] {
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
