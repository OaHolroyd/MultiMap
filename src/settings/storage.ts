import {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    cloneSettings,
    migrateStorageShape,
    type AppSettings
} from './settings';

export function loadSettings(): AppSettings {
    try {
        const storedJson = localStorage.getItem(SETTINGS_STORAGE_KEY);
        const savedData = storedJson ? JSON.parse(storedJson) : null;
        const { data, didChange } = migrateStorageShape(savedData);

        if (didChange) {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(data));
        }

        return data;
    } catch {
        return cloneSettings(DEFAULT_SETTINGS);
    }
}

export function saveSettings(savedData: AppSettings): void {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(savedData));
}
