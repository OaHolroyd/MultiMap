import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    cloneSettings,
    migrateStorageShape,
    type AppSettings
} from './settings';
import { loadStoredJson, saveStoredJson } from '../storage/localStorage';

export function loadSettings(): AppSettings {
    return loadStoredJson({
        key: SETTINGS_STORAGE_KEY,
        fallback: () => cloneSettings(DEFAULT_SETTINGS),
        migrate: migrateStorageShape
    });
}

export function saveSettings(savedData: AppSettings): void {
    saveStoredJson(SETTINGS_STORAGE_KEY, savedData);
}
