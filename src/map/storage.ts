import type { AppSettings } from '../settings/settings';
import { loadStoredJson, saveStoredJson } from '../storage/localStorage';
import {
    LAYER_SELECTION_STORAGE_KEY,
    cloneLayerSelection,
    getDefaultLayerSelection,
    migrateLayerSelection,
    type LayerSelectionState
} from './layerSelection';

export function loadLayerSelection(settings: AppSettings): LayerSelectionState {
    return loadStoredJson({
        key: LAYER_SELECTION_STORAGE_KEY,
        fallback: () => cloneLayerSelection(getDefaultLayerSelection(settings)),
        migrate: (savedData) => migrateLayerSelection(savedData, settings)
    });
}

export function saveLayerSelection(selection: LayerSelectionState): void {
    saveStoredJson(LAYER_SELECTION_STORAGE_KEY, selection);
}
