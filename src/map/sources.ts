import type { StorageMigrationResult } from '../storage/localStorage';

const SWISSTOPO_BOUNDS: [number, number, number, number] = [5.140242, 45.398181, 11.47757, 48.230651];
const DEFAULT_TILE_SIZE = 256;
const DEFAULT_OPACITY = 1.0;

export type RasterSourceKind = 'base' | 'overlay';

export interface RasterSourceConfig {
    readonly id: string;
    readonly layerId: string;
    readonly type: RasterSourceKind;
    readonly tiles: readonly string[];
    readonly tileSize: number;
    readonly zlims: readonly [number, number];
    readonly bounds: [number, number, number, number] | null;
    readonly attribution: string;
    readonly example_zxy: readonly [number, number, number];
    readonly opacity: number;
}

export const SOURCE_OPEN_TOPO_MAP: RasterSourceConfig = {
    id: 'open-topo-map',
    layerId: 'OpenTopoMap',
    type: 'base',
    tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 17],
    bounds: null,
    attribution: '© OpenStreetMap contributors',
    example_zxy: [12, 2132, 1457],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_OPEN_STREET_MAP: RasterSourceConfig = {
    id: 'open-street-map',
    layerId: 'OpenStreetMap',
    type: 'base',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 21],
    bounds: null,
    attribution: '© OpenStreetMap contributors',
    example_zxy: [13, 4054, 2685],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_SWISSTOPO_BASE: RasterSourceConfig = {
    id: 'swisstopo-base',
    layerId: 'SwissTopoBase',
    type: 'base',
    tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 19],
    bounds: SWISSTOPO_BOUNDS,
    attribution: '© swisstopo',
    example_zxy: [13, 4271, 2911],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_ESRI_SATELLITE: RasterSourceConfig = {
    id: 'esri-satellite',
    layerId: 'EsriSatellite',
    type: 'base',
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 19],
    bounds: null,
    attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    example_zxy: [13, 4149, 2818],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_ESRI_PLACES: RasterSourceConfig = {
    id: 'esri-places',
    layerId: 'EsriPlaces',
    type: 'overlay',
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 19],
    bounds: null,
    attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    example_zxy: [13, 4149, 2818],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_ESRI_TRANSPORTATION: RasterSourceConfig = {
    id: 'esri-transportation',
    layerId: 'EsriTransportation',
    type: 'overlay',
    tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 19],
    bounds: null,
    attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
    example_zxy: [13, 4149, 2818],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_CARTO_LABELS: RasterSourceConfig = {
    id: 'carto_labels',
    layerId: 'CartoLabels',
    type: 'overlay',
    tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 20],
    bounds: null,
    attribution: '© OpenStreetMap contributors © CARTO',
    example_zxy: [13, 4149, 2818],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_SWISSTOPO_TRAILS: RasterSourceConfig = {
    id: 'swisstopo-trails',
    layerId: 'SwissTopoTrails',
    type: 'overlay',
    tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swisstlm3d-wanderwege/default/current/3857/{z}/{x}/{y}.png'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 18],
    bounds: SWISSTOPO_BOUNDS,
    attribution: '© swisstopo',
    example_zxy: [14, 8561, 5766],
    opacity: DEFAULT_OPACITY
};

export const SOURCE_SWISSTOPO_DOGS: RasterSourceConfig = {
    id: 'swisstopo-dogs',
    layerId: 'SwissTopoDogs',
    type: 'overlay',
    tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.bafu.alpweiden-herdenschutzhunde/default/current/3857/{z}/{x}/{y}.png'],
    tileSize: DEFAULT_TILE_SIZE,
    zlims: [0, 18],
    bounds: SWISSTOPO_BOUNDS,
    attribution: '© swisstopo',
    example_zxy: [14, 8561, 5766],
    opacity: 0.5
};

export const DEFAULT_RASTER_SOURCE: RasterSourceConfig = SOURCE_OPEN_TOPO_MAP;

const DEFAULT_RASTER_SOURCES: readonly RasterSourceConfig[] = [
    SOURCE_OPEN_TOPO_MAP,
    SOURCE_OPEN_STREET_MAP,
    SOURCE_SWISSTOPO_BASE,
    SOURCE_ESRI_SATELLITE
];

const DEFAULT_RASTER_OVERLAYS: readonly RasterSourceConfig[] = [
    SOURCE_ESRI_PLACES,
    SOURCE_ESRI_TRANSPORTATION,
    SOURCE_CARTO_LABELS,
    SOURCE_SWISSTOPO_TRAILS,
    SOURCE_SWISSTOPO_DOGS
];

let customRasterSources: RasterSourceConfig[] = [];
let baseSourceOrderIds: string[] = DEFAULT_RASTER_SOURCES.map((source) => source.id);
let overlaySourceOrderIds: string[] = DEFAULT_RASTER_OVERLAYS.map((source) => source.id);

export interface SourceCatalogState {
    readonly customSources: RasterSourceConfig[];
    readonly baseOrderIds: string[];
    readonly overlayOrderIds: string[];
}

export function getDefaultRasterSources(): RasterSourceConfig[] {
    return [...DEFAULT_RASTER_SOURCES];
}

export function getDefaultRasterOverlays(): RasterSourceConfig[] {
    return [...DEFAULT_RASTER_OVERLAYS];
}

export function getCustomRasterSources(): RasterSourceConfig[] {
    return [...customRasterSources];
}

export function setCustomRasterSources(sources: readonly RasterSourceConfig[]): void {
    customRasterSources = [...sources];
    reconcileSourceOrders();
}

export function getSourceCatalogState(): SourceCatalogState {
    return {
        customSources: getCustomRasterSources(),
        baseOrderIds: [...baseSourceOrderIds],
        overlayOrderIds: [...overlaySourceOrderIds]
    };
}

export function setSourceCatalogState(state: SourceCatalogState): void {
    customRasterSources = [...state.customSources];
    baseSourceOrderIds = reconcileOrderIds(
        state.baseOrderIds,
        getKnownBaseSourceIds()
    );
    overlaySourceOrderIds = reconcileOrderIds(
        state.overlayOrderIds,
        getKnownOverlaySourceIds()
    );
}

export function appendCustomRasterSources(sources: readonly RasterSourceConfig[]): void {
    customRasterSources = [
        ...customRasterSources,
        ...sources
    ];
    reconcileSourceOrders();
}

export function reorderRasterSource(sourceId: string, targetSourceId: string): boolean {
    const source = findRasterSourceById(sourceId);
    const targetSource = findRasterSourceById(targetSourceId);

    if (!source || !targetSource || source.type !== targetSource.type || sourceId === targetSourceId) {
        return false;
    }

    const nextOrderIds = source.type === 'base'
        ? reorderIds(baseSourceOrderIds, sourceId, targetSourceId)
        : reorderIds(overlaySourceOrderIds, sourceId, targetSourceId);

    if (!nextOrderIds) {
        return false;
    }

    if (source.type === 'base') {
        baseSourceOrderIds = nextOrderIds;
    } else {
        overlaySourceOrderIds = nextOrderIds;
    }

    return true;
}

export function setRasterSourceOrder(
    sourceKind: RasterSourceKind,
    orderedSourceIds: readonly string[]
): void {
    if (sourceKind === 'base') {
        baseSourceOrderIds = reconcileOrderIds(orderedSourceIds, getKnownBaseSourceIds());
        return;
    }

    overlaySourceOrderIds = reconcileOrderIds(orderedSourceIds, getKnownOverlaySourceIds());
}

export function deleteCustomRasterSource(sourceId: string): RasterSourceConfig | null {
    const source = customRasterSources.find((entry) => entry.id === sourceId);
    if (!source) {
        return null;
    }

    customRasterSources = customRasterSources.filter((entry) => entry.id !== sourceId);
    baseSourceOrderIds = baseSourceOrderIds.filter((id) => id !== sourceId);
    overlaySourceOrderIds = overlaySourceOrderIds.filter((id) => id !== sourceId);
    reconcileSourceOrders();

    return source;
}

export function isDefaultRasterSource(sourceId: string): boolean {
    return DEFAULT_RASTER_SOURCES.some((source) => source.id === sourceId) ||
        DEFAULT_RASTER_OVERLAYS.some((source) => source.id === sourceId);
}

export function isCustomRasterSource(sourceId: string): boolean {
    return customRasterSources.some((source) => source.id === sourceId);
}

export function getAllRasterSources(): RasterSourceConfig[] {
    return [
        ...DEFAULT_RASTER_SOURCES,
        ...DEFAULT_RASTER_OVERLAYS,
        ...customRasterSources
    ];
}

export function getBaseRasterSources(): RasterSourceConfig[] {
    return sortSourcesByOrder(
        getAllRasterSources().filter((source) => source.type === 'base'),
        baseSourceOrderIds
    );
}

export function getOverlayRasterSources(): RasterSourceConfig[] {
    return sortSourcesByOrder(
        getAllRasterSources().filter((source) => source.type === 'overlay'),
        overlaySourceOrderIds
    );
}

export function getDefaultSettingsBaseSourceId(): string {
    return DEFAULT_RASTER_SOURCE.id;
}

export function findRasterSourceById(sourceId: string): RasterSourceConfig | undefined {
    return getAllRasterSources().find((source) => source.id === sourceId);
}

export function migrateCustomRasterSources(savedData: unknown): StorageMigrationResult<RasterSourceConfig[]> {
    const parsedSources = normalizeRasterSourceCollection(savedData, {
        allowSingleObject: false,
        failOnError: false
    });

    return {
        data: parsedSources.sources,
        didChange: parsedSources.didChange
    };
}

export function migrateSourceCatalog(savedData: unknown): StorageMigrationResult<SourceCatalogState> {
    if (isObject(savedData) && ('customSources' in savedData || 'baseOrderIds' in savedData || 'overlayOrderIds' in savedData)) {
        const customSourcesResult = normalizeRasterSourceCollection(savedData.customSources, {
            allowSingleObject: false,
            failOnError: false
        });

        const nextCustomSources = customSourcesResult.sources;
        const knownBaseIds = getKnownBaseSourceIds(nextCustomSources);
        const knownOverlayIds = getKnownOverlaySourceIds(nextCustomSources);
        const baseOrderIds = reconcileOrderIds(savedData.baseOrderIds, knownBaseIds);
        const overlayOrderIds = reconcileOrderIds(savedData.overlayOrderIds, knownOverlayIds);

        return {
            data: {
                customSources: nextCustomSources,
                baseOrderIds,
                overlayOrderIds
            },
            didChange: customSourcesResult.didChange ||
                !arraysEqual(baseOrderIds, Array.isArray(savedData.baseOrderIds) ? savedData.baseOrderIds.filter(isString) : []) ||
                !arraysEqual(overlayOrderIds, Array.isArray(savedData.overlayOrderIds) ? savedData.overlayOrderIds.filter(isString) : [])
        };
    }

    const customSourcesResult = normalizeRasterSourceCollection(savedData, {
        allowSingleObject: false,
        failOnError: false
    });

    return {
        data: {
            customSources: customSourcesResult.sources,
            baseOrderIds: reconcileOrderIds([], getKnownBaseSourceIds(customSourcesResult.sources)),
            overlayOrderIds: reconcileOrderIds([], getKnownOverlaySourceIds(customSourcesResult.sources))
        },
        didChange: true
    };
}

export function parseRasterSourceImport(
    savedData: unknown,
    existingSources: readonly RasterSourceConfig[]
): RasterSourceConfig[] {
    const parsedSources = normalizeRasterSourceCollection(savedData, {
        allowSingleObject: true,
        failOnError: true
    });

    assertNoConflicts(parsedSources.sources, existingSources);
    return parsedSources.sources;
}

interface NormalizeOptions {
    readonly allowSingleObject: boolean;
    readonly failOnError: boolean;
}

interface NormalizeResult {
    readonly sources: RasterSourceConfig[];
    readonly didChange: boolean;
}

function normalizeRasterSourceCollection(
    savedData: unknown,
    options: NormalizeOptions
): NormalizeResult {
    if (savedData === null || savedData === undefined) {
        return {
            sources: [],
            didChange: false
        };
    }

    const rawItems = Array.isArray(savedData)
        ? savedData
        : options.allowSingleObject && isObject(savedData)
            ? [savedData]
            : [];

    if (rawItems.length === 0) {
        if (options.failOnError) {
            throw new Error('Layer import must contain a single layer object or an array of layer objects.');
        }

        return {
            sources: [],
            didChange: savedData !== null
        };
    }

    const sources: RasterSourceConfig[] = [];
    let didChange = !Array.isArray(savedData);

    rawItems.forEach((rawItem, index) => {
        try {
            sources.push(normalizeRasterSource(rawItem));
        } catch (error) {
            didChange = true;
            if (options.failOnError) {
                const message = error instanceof Error ? error.message : 'Invalid layer definition.';
                throw new Error(`Layer ${index + 1}: ${message}`);
            }
        }
    });

    const { uniqueSources, didChange: didDeduplicate } = deduplicateSources(sources, options.failOnError);

    return {
        sources: uniqueSources,
        didChange: didChange || didDeduplicate
    };
}

function normalizeRasterSource(rawSource: unknown): RasterSourceConfig {
    if (!isObject(rawSource)) {
        throw new Error('Each layer definition must be a JSON object.');
    }

    const id = requireString(rawSource.id, 'id');
    const layerId = requireString(rawSource.layerId, 'layerId');
    const type = requireSourceKind(rawSource.type);
    const tiles = requireStringArray(rawSource.tiles, 'tiles');
    const tileSize = rawSource.tileSize === undefined
        ? DEFAULT_TILE_SIZE
        : requirePositiveInteger(rawSource.tileSize, 'tileSize');
    const zlims = requirePair(rawSource.zlims, 'zlims');
    const bounds = rawSource.bounds === undefined || rawSource.bounds === null
        ? null
        : requireBounds(rawSource.bounds, 'bounds');
    const attribution = rawSource.attribution === undefined
        ? ''
        : requireString(rawSource.attribution, 'attribution');
    const example_zxy = requireTriplet(rawSource.example_zxy, 'example_zxy');
    const opacity = rawSource.opacity === undefined
        ? DEFAULT_OPACITY
        : requireOpacity(rawSource.opacity, 'opacity');

    return {
        id,
        layerId,
        type,
        tiles,
        tileSize,
        zlims,
        bounds,
        attribution,
        example_zxy,
        opacity
    };
}

function deduplicateSources(
    sources: readonly RasterSourceConfig[],
    failOnError: boolean
): { uniqueSources: RasterSourceConfig[]; didChange: boolean } {
    const seenIds = new Set<string>();
    const seenLayerIds = new Set<string>();
    const uniqueSources: RasterSourceConfig[] = [];
    let didChange = false;

    sources.forEach((source) => {
        if (seenIds.has(source.id)) {
            didChange = true;
            if (failOnError) {
                throw new Error(`Duplicate source id "${source.id}".`);
            }
            return;
        }
        if (seenLayerIds.has(source.layerId)) {
            didChange = true;
            if (failOnError) {
                throw new Error(`Duplicate layerId "${source.layerId}".`);
            }
            return;
        }

        seenIds.add(source.id);
        seenLayerIds.add(source.layerId);
        uniqueSources.push(source);
    });

    return {
        uniqueSources,
        didChange
    };
}

function assertNoConflicts(
    importedSources: readonly RasterSourceConfig[],
    existingSources: readonly RasterSourceConfig[]
): void {
    const existingIds = new Set(existingSources.map((source) => source.id));
    const existingLayerIds = new Set(existingSources.map((source) => source.layerId));

    for (const source of importedSources) {
        if (existingIds.has(source.id)) {
            throw new Error(`A layer with id "${source.id}" already exists.`);
        }
        if (existingLayerIds.has(source.layerId)) {
            throw new Error(`A layer with layerId "${source.layerId}" already exists.`);
        }
    }
}

function requireString(value: unknown, fieldName: string): string {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`"${fieldName}" must be a non-empty string.`);
    }

    return value;
}

function requireStringArray(value: unknown, fieldName: string): string[] {
    if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
        throw new Error(`"${fieldName}" must be a non-empty array of strings.`);
    }

    return [...value];
}

function requirePositiveInteger(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`"${fieldName}" must be a positive integer.`);
    }

    return value;
}

function requirePair(value: unknown, fieldName: string): [number, number] {
    if (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
        throw new Error(`"${fieldName}" must be an array of two numbers.`);
    }

    return [value[0], value[1]];
}

function requireTriplet(value: unknown, fieldName: string): [number, number, number] {
    if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
        throw new Error(`"${fieldName}" must be an array of three numbers.`);
    }

    return [value[0], value[1], value[2]];
}

function requireBounds(value: unknown, fieldName: string): [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
        throw new Error(`"${fieldName}" must be an array of four numbers.`);
    }

    return [value[0], value[1], value[2], value[3]];
}

function requireOpacity(value: unknown, fieldName: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`"${fieldName}" must be a number between 0 and 1.`);
    }

    return value;
}

function requireSourceKind(value: unknown): RasterSourceKind {
    if (value !== 'base' && value !== 'overlay') {
        throw new Error('"type" must be either "base" or "overlay".');
    }

    return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
    return typeof value === 'string';
}

function reconcileSourceOrders(): void {
    baseSourceOrderIds = reconcileOrderIds(baseSourceOrderIds, getKnownBaseSourceIds());
    overlaySourceOrderIds = reconcileOrderIds(overlaySourceOrderIds, getKnownOverlaySourceIds());
}

function getKnownBaseSourceIds(customSources: readonly RasterSourceConfig[] = customRasterSources): string[] {
    return [
        ...DEFAULT_RASTER_SOURCES.map((source) => source.id),
        ...customSources.filter((source) => source.type === 'base').map((source) => source.id)
    ];
}

function getKnownOverlaySourceIds(customSources: readonly RasterSourceConfig[] = customRasterSources): string[] {
    return [
        ...DEFAULT_RASTER_OVERLAYS.map((source) => source.id),
        ...customSources.filter((source) => source.type === 'overlay').map((source) => source.id)
    ];
}

function reconcileOrderIds(candidateIds: unknown, knownIds: readonly string[]): string[] {
    const knownIdSet = new Set(knownIds);
    const orderedIds = Array.isArray(candidateIds)
        ? candidateIds.filter(isString).filter((id, index, ids) => knownIdSet.has(id) && ids.indexOf(id) === index)
        : [];
    const missingIds = knownIds.filter((id) => !orderedIds.includes(id));

    return [
        ...orderedIds,
        ...missingIds
    ];
}

function sortSourcesByOrder(
    sources: readonly RasterSourceConfig[],
    orderIds: readonly string[]
): RasterSourceConfig[] {
    const orderIndex = new Map(orderIds.map((id, index) => [id, index]));

    return [...sources].sort((left, right) => {
        const leftIndex = orderIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = orderIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
    });
}

function reorderIds(
    sourceIds: readonly string[],
    draggedId: string,
    targetId: string
): string[] | null {
    const nextIds = [...sourceIds];
    const fromIndex = nextIds.indexOf(draggedId);
    const toIndex = nextIds.indexOf(targetId);

    if (fromIndex === -1 || toIndex === -1) {
        return null;
    }

    nextIds.splice(fromIndex, 1);
    const insertionIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    nextIds.splice(insertionIndex, 0, draggedId);
    return nextIds;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((value, index) => value === right[index]);
}
