import type { RasterSourceConfig } from '../map/sources';
import {
    DEFAULT_DOWNLOAD_MAX_ZOOM,
    MAX_DOWNLOAD_TILE_WARNING_COUNT,
    OFFLINE_TILE_CACHE_ROOT,
    OFFLINE_TILE_CACHE_VERSION,
    type OfflineDownloadFootprint,
    type OfflineDownloadGeometry,
    type OfflineDownloadJob,
    type OfflineSourceSnapshot,
    type OfflineTileCacheManifest,
    type OfflineTileOwnerEntry,
    type TileCoordinate,
    type TileDownloadTask,
    type ViewportDownloadRequest
} from './types';
import { enumerateViewportTiles } from './tileMath';
import { buildTileRequestUrl } from './tileUrl';
import { notifyOfflineTileCacheUpdated } from './serviceWorkerBridge';

const MANIFEST_FILENAME = 'cache.json';
const TILES_DIRECTORY = 'tiles';
const OWNERSHIP_DIRECTORY = 'ownership';
const DEFAULT_MANIFEST: OfflineTileCacheManifest = {
    version: OFFLINE_TILE_CACHE_VERSION,
    updatedAt: new Date(0).toISOString(),
    sources: [],
    jobs: []
};

interface MutableOfflineTileCacheManifest extends OfflineTileCacheManifest {
    sources: OfflineSourceSnapshot[];
    jobs: OfflineDownloadJob[];
}

type OwnershipShard = Record<string, OfflineTileOwnerEntry>;

export interface OfflineDownloadPlan {
    readonly minZoom: number;
    readonly maxZoom: number;
    readonly tasks: TileDownloadTask[];
    readonly sourceIds: string[];
}

export interface ViewportDownloadProgressUpdate {
    readonly job: OfflineDownloadJob;
    readonly completedTiles: number;
    readonly totalTiles: number;
    readonly sizeBytes: number;
}

interface ViewportDownloadOptions {
    readonly onJobCreated?: (job: OfflineDownloadJob) => void;
    readonly onProgress?: (update: ViewportDownloadProgressUpdate) => void;
}

export async function syncOfflineSourceCatalog(sources: readonly RasterSourceConfig[]): Promise<void> {
    const manifest = await readManifest();
    await writeManifest({
        ...manifest,
        sources: sources.map(cloneSourceSnapshot)
    });
    await notifyOfflineTileCacheUpdated();
}

export async function listOfflineDownloads(): Promise<OfflineDownloadJob[]> {
    const manifest = await readManifest();
    return [...manifest.jobs].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}

export function createViewportDownloadPlan(
    bounds: [number, number, number, number],
    minZoom: number,
    maxZoom: number,
    sources: readonly RasterSourceConfig[]
): OfflineDownloadPlan {
    const tasks = sources.flatMap((source) => {
        const coordinates = enumerateViewportTiles(
            bounds,
            source,
            minZoom,
            maxZoom
        );

        return coordinates.map((coordinate) => ({
            ...coordinate,
            source,
            requestUrl: buildTileRequestUrl(source, coordinate),
            tileKey: buildTileKey(source.id, coordinate)
        }));
    });

    const uniqueTasks = deduplicateDownloadTasks(tasks);
    const minimumZoom = uniqueTasks.reduce((currentMinimum, task) =>
        Math.min(currentMinimum, task.z), Number.POSITIVE_INFINITY
    );
    const normalizedMinZoom = Number.isFinite(minimumZoom) ? minimumZoom : 0;

    return {
        minZoom: normalizedMinZoom,
        maxZoom: Math.max(normalizedMinZoom, Math.floor(maxZoom)),
        tasks: uniqueTasks,
        sourceIds: [...new Set(uniqueTasks.map((task) => task.source.id))]
    };
}

export async function downloadViewportTiles(
    request: ViewportDownloadRequest,
    options: ViewportDownloadOptions = {}
): Promise<OfflineDownloadJob> {
    await ensurePersistentStorage();

    const initialManifest = await readManifest();
    const manifest = {
        ...initialManifest,
        sources: mergeSourceSnapshots(initialManifest.sources, request.sources)
    };

    const plan = createViewportDownloadPlan(
        request.bounds,
        request.minZoom,
        request.maxZoom,
        request.sources
    );

    const jobId = createJobId();
    const inProgressJob: OfflineDownloadJob = {
        id: jobId,
        name: request.name,
        createdAt: new Date().toISOString(),
        sourceIds: plan.sourceIds,
        bounds: [...request.bounds] as [number, number, number, number],
        footprint: createRectangleFootprint(request.bounds),
        minZoom: plan.minZoom,
        maxZoom: plan.maxZoom,
        tileCount: plan.tasks.length,
        sizeBytes: 0,
        status: 'downloading'
    };

    const manifestWithJob = {
        ...manifest,
        jobs: [...manifest.jobs, inProgressJob]
    };
    await writeManifest(manifestWithJob);
    await notifyOfflineTileCacheUpdated();
    options.onJobCreated?.(cloneJob(inProgressJob));
    options.onProgress?.({
        job: cloneJob(inProgressJob),
        completedTiles: 0,
        totalTiles: plan.tasks.length,
        sizeBytes: 0
    });

    const shardCache = new Map<string, OwnershipShard>();
    let sizeBytes = 0;
    let completedTiles = 0;

    try {
        for (const task of plan.tasks) {
            const sizeDelta = await persistTileTask(task, jobId, shardCache);
            sizeBytes += sizeDelta;
            completedTiles += 1;

            options.onProgress?.({
                job: cloneJob(inProgressJob),
                completedTiles,
                totalTiles: plan.tasks.length,
                sizeBytes
            });
        }

        const completedJob: OfflineDownloadJob = {
            ...inProgressJob,
            sizeBytes,
            status: 'complete'
        };

        await writeManifest({
            ...manifestWithJob,
            jobs: manifestWithJob.jobs.map((job) => job.id === jobId ? completedJob : job)
        });
        await flushOwnershipShards(shardCache);
        await notifyOfflineTileCacheUpdated();

        return completedJob;
    } catch (error) {
        await flushOwnershipShards(shardCache);
        await deleteOfflineDownload(jobId);
        throw error;
    }
}

export async function deleteOfflineDownload(jobId: string): Promise<boolean> {
    const manifest = await readManifest();
    const existingJob = manifest.jobs.find((job) => job.id === jobId);
    if (!existingJob) {
        return false;
    }

    const root = await getCacheRootDirectory();
    const ownershipRoot = await root.getDirectoryHandle(OWNERSHIP_DIRECTORY, { create: true });
    const tilesRoot = await root.getDirectoryHandle(TILES_DIRECTORY, { create: true });
    const shardCache = new Map<string, OwnershipShard>();

    for (const sourceId of existingJob.sourceIds) {
        const sourceDirectory = await getOptionalDirectoryHandle(ownershipRoot, sourceId);
        if (!sourceDirectory) {
            continue;
        }

        for await (const [zoomDirectoryName] of sourceDirectory.entries()) {
            const zoomDirectory = await getOptionalDirectoryHandle(sourceDirectory, zoomDirectoryName);
            if (!zoomDirectory) {
                continue;
            }

            for await (const [shardFileName] of zoomDirectory.entries()) {
                if (!shardFileName.endsWith('.json')) {
                    continue;
                }

                const shardPath = `${sourceId}/${zoomDirectoryName}/${shardFileName}`;
                const shard = await getOwnershipShard(shardPath, shardCache);
                const xIndex = shardFileName.replace(/\.json$/, '');
                let didChange = false;

                for (const [yIndex, entry] of Object.entries(shard)) {
                    if (!entry.owners.includes(jobId)) {
                        continue;
                    }

                    const nextOwners = entry.owners.filter((ownerId) => ownerId !== jobId);
                    didChange = true;

                    if (nextOwners.length === 0) {
                        delete shard[yIndex];
                        await deleteTileFile(
                            tilesRoot,
                            sourceId,
                            zoomDirectoryName,
                            xIndex,
                            yIndex,
                            entry.extension
                        );
                        continue;
                    }

                    shard[yIndex] = {
                        ...entry,
                        owners: nextOwners
                    };
                }

                if (didChange) {
                    shardCache.set(shardPath, shard);
                }
            }
        }
    }

    await writeManifest({
        ...manifest,
        jobs: manifest.jobs.filter((job) => job.id !== jobId)
    });
    await flushOwnershipShards(shardCache);
    await removeEmptyDirectories(root);
    await notifyOfflineTileCacheUpdated();

    return true;
}

export async function deleteAllOfflineDownloads(): Promise<void> {
    const manifest = await readManifest();
    for (const job of [...manifest.jobs]) {
        await deleteOfflineDownload(job.id);
    }
}

export function getDefaultDownloadMaxZoom(): number {
    return DEFAULT_DOWNLOAD_MAX_ZOOM;
}

export function getDownloadTileWarningCount(): number {
    return MAX_DOWNLOAD_TILE_WARNING_COUNT;
}

function deduplicateDownloadTasks(tasks: readonly TileDownloadTask[]): TileDownloadTask[] {
    const uniqueTasks = new Map<string, TileDownloadTask>();
    tasks.forEach((task) => {
        uniqueTasks.set(task.tileKey, task);
    });
    return [...uniqueTasks.values()];
}

async function persistTileTask(
    task: TileDownloadTask,
    jobId: string,
    shardCache: Map<string, OwnershipShard>
): Promise<number> {
    const shardPath = buildOwnershipShardPath(task.source.id, task.z, task.x);
    const shard = await getOwnershipShard(shardPath, shardCache);
    const yIndex = String(task.y);
    const existingEntry = shard[yIndex];

    if (existingEntry) {
        if (!existingEntry.owners.includes(jobId)) {
            shard[yIndex] = {
                ...existingEntry,
                owners: [...existingEntry.owners, jobId]
            };
        }

        shardCache.set(shardPath, shard);
        return existingEntry.sizeBytes;
    }

    const networkResponse = await fetch(task.requestUrl);
    if (!networkResponse.ok) {
        throw new Error(`Failed to download tile ${task.requestUrl}: ${networkResponse.status}`);
    }

    const tileBlob = await networkResponse.blob();
    const contentType = tileBlob.type || networkResponse.headers.get('content-type') || 'application/octet-stream';
    const extension = inferTileExtension(task.requestUrl, contentType);
    await writeTileBlob(task, extension, tileBlob);

    shard[yIndex] = {
        owners: [jobId],
        sizeBytes: tileBlob.size,
        contentType,
        extension,
        requestUrl: task.requestUrl
    };
    shardCache.set(shardPath, shard);

    return tileBlob.size;
}

async function writeTileBlob(task: TileDownloadTask, extension: string, tileBlob: Blob): Promise<void> {
    const root = await getCacheRootDirectory();
    const tilesRoot = await root.getDirectoryHandle(TILES_DIRECTORY, { create: true });
    const sourceDirectory = await tilesRoot.getDirectoryHandle(task.source.id, { create: true });
    const zoomDirectory = await sourceDirectory.getDirectoryHandle(String(task.z), { create: true });
    const xDirectory = await zoomDirectory.getDirectoryHandle(String(task.x), { create: true });
    const tileFileHandle = await xDirectory.getFileHandle(`${task.y}.${extension}`, { create: true });
    const writable = await tileFileHandle.createWritable();

    await writable.write(tileBlob);
    await writable.close();
}

async function getOwnershipShard(
    shardPath: string,
    shardCache: Map<string, OwnershipShard>
): Promise<OwnershipShard> {
    const cachedShard = shardCache.get(shardPath);
    if (cachedShard) {
        return cachedShard;
    }

    const root = await getCacheRootDirectory();
    const ownershipRoot = await root.getDirectoryHandle(OWNERSHIP_DIRECTORY, { create: true });
    const [sourceId, zoomLevel, shardFileName] = shardPath.split('/');
    const sourceDirectory = await ownershipRoot.getDirectoryHandle(sourceId, { create: true });
    const zoomDirectory = await sourceDirectory.getDirectoryHandle(zoomLevel, { create: true });
    const shardFileHandle = await zoomDirectory.getFileHandle(shardFileName, { create: true });

    let shard: OwnershipShard = {};
    try {
        const shardFile = await shardFileHandle.getFile();
        const rawShard = JSON.parse(await shardFile.text()) as OwnershipShard;
        shard = isObject(rawShard) ? rawShard : {};
    } catch {
        shard = {};
    }

    shardCache.set(shardPath, shard);
    return shard;
}

async function flushOwnershipShards(shardCache: Map<string, OwnershipShard>): Promise<void> {
    const root = await getCacheRootDirectory();
    const ownershipRoot = await root.getDirectoryHandle(OWNERSHIP_DIRECTORY, { create: true });

    for (const [shardPath, shard] of shardCache.entries()) {
        const [sourceId, zoomLevel, shardFileName] = shardPath.split('/');
        const sourceDirectory = await ownershipRoot.getDirectoryHandle(sourceId, { create: true });
        const zoomDirectory = await sourceDirectory.getDirectoryHandle(zoomLevel, { create: true });

        if (Object.keys(shard).length === 0) {
            await removeEntryIfExists(zoomDirectory, shardFileName, false);
            continue;
        }

        const shardFileHandle = await zoomDirectory.getFileHandle(shardFileName, { create: true });
        const writable = await shardFileHandle.createWritable();
        await writable.write(JSON.stringify(shard));
        await writable.close();
    }
}

async function readManifest(): Promise<MutableOfflineTileCacheManifest> {
    const root = await getCacheRootDirectory();
    const manifestFileHandle = await root.getFileHandle(MANIFEST_FILENAME, { create: true });

    try {
        const manifestFile = await manifestFileHandle.getFile();
        if (manifestFile.size === 0) {
            return {
                ...DEFAULT_MANIFEST,
                sources: [],
                jobs: []
            };
        }

        const parsedManifest = JSON.parse(await manifestFile.text()) as OfflineTileCacheManifest;
        return normalizeManifest(parsedManifest);
    } catch {
        return {
            ...DEFAULT_MANIFEST,
            sources: [],
            jobs: []
        };
    }
}

async function writeManifest(manifest: MutableOfflineTileCacheManifest): Promise<void> {
    const root = await getCacheRootDirectory();
    const manifestFileHandle = await root.getFileHandle(MANIFEST_FILENAME, { create: true });
    const writable = await manifestFileHandle.createWritable();

    await writable.write(JSON.stringify({
        ...manifest,
        updatedAt: new Date().toISOString()
    }));
    await writable.close();
}

function normalizeManifest(manifest: OfflineTileCacheManifest): MutableOfflineTileCacheManifest {
    return {
        version: OFFLINE_TILE_CACHE_VERSION,
        updatedAt: typeof manifest.updatedAt === 'string' ? manifest.updatedAt : new Date(0).toISOString(),
        sources: Array.isArray(manifest.sources) ? manifest.sources.map(cloneSourceSnapshot) : [],
        jobs: Array.isArray(manifest.jobs) ? manifest.jobs.map(cloneJob) : []
    };
}

function mergeSourceSnapshots(
    existingSources: readonly OfflineSourceSnapshot[],
    nextSources: readonly RasterSourceConfig[]
): OfflineSourceSnapshot[] {
    const mergedSources = new Map<string, OfflineSourceSnapshot>();

    existingSources.forEach((source) => {
        mergedSources.set(source.id, cloneSourceSnapshot(source));
    });

    nextSources.forEach((source) => {
        mergedSources.set(source.id, cloneSourceSnapshot(source));
    });

    return [...mergedSources.values()];
}

function cloneSourceSnapshot(source: OfflineSourceSnapshot | RasterSourceConfig): OfflineSourceSnapshot {
    return {
        id: source.id,
        layerId: source.layerId,
        type: source.type,
        tiles: [...source.tiles],
        tileSize: source.tileSize,
        zlims: [...source.zlims] as [number, number],
        bounds: source.bounds ? [...source.bounds] as [number, number, number, number] : null,
        attribution: source.attribution,
        example_zxy: [...source.example_zxy] as [number, number, number],
        opacity: source.opacity
    };
}

function cloneJob(job: OfflineDownloadJob): OfflineDownloadJob {
    return {
        ...job,
        sourceIds: [...job.sourceIds],
        bounds: [...job.bounds] as [number, number, number, number],
        footprint: normalizeFootprint(job.footprint, job.bounds)
    };
}

function normalizeFootprint(
    footprint: OfflineDownloadFootprint | undefined,
    bounds: [number, number, number, number]
): OfflineDownloadFootprint {
    if (footprint && isValidGeometry(footprint.geometry)) {
        return {
            kind: footprint.kind === 'polygon' ? 'polygon' : 'viewport-rectangle',
            geometry: cloneGeometry(footprint.geometry)
        };
    }

    return createRectangleFootprint(bounds);
}

function createRectangleFootprint(bounds: [number, number, number, number]): OfflineDownloadFootprint {
    const [west, south, east, north] = bounds;

    return {
        kind: 'viewport-rectangle',
        geometry: {
            type: 'Polygon',
            coordinates: [[
                [west, south],
                [east, south],
                [east, north],
                [west, north],
                [west, south]
            ]]
        }
    };
}

function cloneGeometry(geometry: OfflineDownloadGeometry): OfflineDownloadGeometry {
    if (geometry.type === 'Polygon') {
        return {
            type: 'Polygon',
            coordinates: geometry.coordinates.map((ring) =>
                ring.map((position) => [...position])
            )
        };
    }

    return {
        type: 'MultiPolygon',
        coordinates: geometry.coordinates.map((polygon) =>
            polygon.map((ring) =>
                ring.map((position) => [...position])
            )
        )
    };
}

function isValidGeometry(geometry: unknown): geometry is OfflineDownloadGeometry {
    if (!isObject(geometry)) {
        return false;
    }

    if (geometry.type === 'Polygon') {
        return Array.isArray(geometry.coordinates);
    }

    if (geometry.type === 'MultiPolygon') {
        return Array.isArray(geometry.coordinates);
    }

    return false;
}

function buildTileKey(sourceId: string, coordinates: TileCoordinate): string {
    return `${sourceId}/${coordinates.z}/${coordinates.x}/${coordinates.y}`;
}

function buildOwnershipShardPath(sourceId: string, zoomLevel: number, xIndex: number): string {
    return `${sourceId}/${zoomLevel}/${xIndex}.json`;
}

async function getCacheRootDirectory(): Promise<FileSystemDirectoryHandle> {
    const rootDirectory = await navigator.storage.getDirectory();
    return rootDirectory.getDirectoryHandle(OFFLINE_TILE_CACHE_ROOT, { create: true });
}

async function ensurePersistentStorage(): Promise<void> {
    if (!('storage' in navigator) || typeof navigator.storage.persist !== 'function') {
        return;
    }

    try {
        await navigator.storage.persist();
    } catch {
        // Best effort only. The app still functions if the browser declines
        // persistent storage, but the cached tiles become more evictable.
    }
}

function createJobId(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `download-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function inferTileExtension(requestUrl: string, contentType: string): string {
    const pathnameExtension = requestUrl.split('?')[0]?.split('.').pop()?.toLowerCase();
    if (pathnameExtension && /^[a-z0-9]+$/.test(pathnameExtension)) {
        return pathnameExtension;
    }

    if (contentType.includes('png')) {
        return 'png';
    }
    if (contentType.includes('jpeg') || contentType.includes('jpg')) {
        return 'jpg';
    }
    if (contentType.includes('webp')) {
        return 'webp';
    }

    return 'bin';
}

async function deleteTileFile(
    tilesRoot: FileSystemDirectoryHandle,
    sourceId: string,
    zoomLevel: string,
    xIndex: string,
    yIndex: string,
    extension: string
): Promise<void> {
    const sourceDirectory = await getOptionalDirectoryHandle(tilesRoot, sourceId);
    const zoomDirectory = sourceDirectory ? await getOptionalDirectoryHandle(sourceDirectory, zoomLevel) : null;
    const xDirectory = zoomDirectory ? await getOptionalDirectoryHandle(zoomDirectory, xIndex) : null;

    if (!xDirectory) {
        return;
    }

    await removeEntryIfExists(xDirectory, `${yIndex}.${extension}`, false);
}

async function removeEmptyDirectories(root: FileSystemDirectoryHandle): Promise<void> {
    const ownershipRoot = await getOptionalDirectoryHandle(root, OWNERSHIP_DIRECTORY);
    const tilesRoot = await getOptionalDirectoryHandle(root, TILES_DIRECTORY);

    if (ownershipRoot) {
        await pruneEmptyTree(ownershipRoot);
    }

    if (tilesRoot) {
        await pruneEmptyTree(tilesRoot);
    }
}

async function pruneEmptyTree(directory: FileSystemDirectoryHandle): Promise<boolean> {
    const entries: Array<[string, FileSystemHandle]> = [];
    for await (const entry of directory.entries()) {
        entries.push(entry);
    }

    for (const [entryName, entryHandle] of entries) {
        if (entryHandle.kind !== 'directory') {
            continue;
        }

        const childDirectory = await directory.getDirectoryHandle(entryName);
        const childIsEmpty = await pruneEmptyTree(childDirectory);
        if (childIsEmpty) {
            await removeEntryIfExists(directory, entryName, true);
        }
    }

    for await (const _entry of directory.entries()) {
        return false;
    }

    return true;
}

async function getOptionalDirectoryHandle(
    directory: FileSystemDirectoryHandle,
    name: string
): Promise<FileSystemDirectoryHandle | null> {
    try {
        return await directory.getDirectoryHandle(name);
    } catch {
        return null;
    }
}

async function removeEntryIfExists(
    directory: FileSystemDirectoryHandle,
    name: string,
    recursive: boolean
): Promise<void> {
    try {
        await directory.removeEntry(name, { recursive });
    } catch {
        // Removing an already-missing entry is a valid cleanup outcome.
    }
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
