export interface StorageMigrationResult<T> {
    readonly data: T;
    readonly didChange: boolean;
}

interface LoadStoredJsonOptions<T> {
    readonly key: string;
    readonly fallback: () => T;
    readonly migrate: (savedData: unknown) => StorageMigrationResult<T>;
}

export function loadStoredJson<T>({
    key,
    fallback,
    migrate
}: LoadStoredJsonOptions<T>): T {
    try {
        const storedJson = localStorage.getItem(key);
        const savedData = storedJson ? JSON.parse(storedJson) : null;
        const { data, didChange } = migrate(savedData);

        if (didChange) {
            saveStoredJson(key, data);
        }

        return data;
    } catch {
        const fallbackData = fallback();
        saveStoredJson(key, fallbackData);
        return fallbackData;
    }
}

export function saveStoredJson<T>(key: string, data: T): void {
    localStorage.setItem(key, JSON.stringify(data));
}
