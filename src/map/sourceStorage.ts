import { loadStoredJson, saveStoredJson } from '../storage/localStorage';
import {
    getSourceCatalogState,
    migrateSourceCatalog,
    setSourceCatalogState,
    type SourceCatalogState
} from './sources';

export const CUSTOM_RASTER_SOURCES_STORAGE_KEY = 'multimap.custom-sources';

export function loadSourceCatalog(): SourceCatalogState {
    const catalogState = loadStoredJson({
        key: CUSTOM_RASTER_SOURCES_STORAGE_KEY,
        fallback: () => getSourceCatalogState(),
        migrate: migrateSourceCatalog
    });

    setSourceCatalogState(catalogState);
    return catalogState;
}

export function saveSourceCatalog(state: SourceCatalogState = getSourceCatalogState()): void {
    saveStoredJson(CUSTOM_RASTER_SOURCES_STORAGE_KEY, state);
}
