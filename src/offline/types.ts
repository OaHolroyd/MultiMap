import type { RasterSourceConfig } from '../map/sources';

export const OFFLINE_TILE_CACHE_ROOT = 'tile-cache';
export const OFFLINE_TILE_CACHE_VERSION = 1;
export const DEFAULT_DOWNLOAD_MAX_ZOOM = 16;
export const MAX_DOWNLOAD_TILE_WARNING_COUNT = 5000;

export type OfflineDownloadStatus = 'downloading' | 'complete';
export type OfflineDownloadFootprintKind = 'viewport-rectangle' | 'polygon';

export interface OfflinePolygonGeometry {
    readonly type: 'Polygon';
    readonly coordinates: number[][][];
}

export interface OfflineMultiPolygonGeometry {
    readonly type: 'MultiPolygon';
    readonly coordinates: number[][][][];
}

export type OfflineDownloadGeometry = OfflinePolygonGeometry | OfflineMultiPolygonGeometry;

export interface OfflineDownloadFootprint {
    readonly kind: OfflineDownloadFootprintKind;
    readonly geometry: OfflineDownloadGeometry;
}

export interface OfflineSourceSnapshot {
    readonly id: string;
    readonly layerId: string;
    readonly type: RasterSourceConfig['type'];
    readonly tiles: string[];
    readonly tileSize: number;
    readonly zlims: [number, number];
    readonly bounds: [number, number, number, number] | null;
    readonly attribution: string;
    readonly example_zxy: [number, number, number];
    readonly opacity: number;
}

export interface OfflineDownloadJob {
    readonly id: string;
    readonly name: string;
    readonly createdAt: string;
    readonly sourceIds: string[];
    readonly bounds: [number, number, number, number];
    readonly footprint: OfflineDownloadFootprint;
    readonly minZoom: number;
    readonly maxZoom: number;
    readonly tileCount: number;
    readonly sizeBytes: number;
    readonly status: OfflineDownloadStatus;
}

export interface OfflineTileOwnerEntry {
    readonly owners: string[];
    readonly sizeBytes: number;
    readonly contentType: string;
    readonly extension: string;
    readonly requestUrl: string;
}

export interface OfflineTileCacheManifest {
    readonly version: number;
    readonly updatedAt: string;
    readonly sources: OfflineSourceSnapshot[];
    readonly jobs: OfflineDownloadJob[];
}

export interface TileCoordinate {
    readonly z: number;
    readonly x: number;
    readonly y: number;
}

export interface TileDownloadTask extends TileCoordinate {
    readonly source: RasterSourceConfig;
    readonly requestUrl: string;
    readonly tileKey: string;
}

export interface ViewportDownloadRequest {
    readonly name: string;
    readonly bounds: [number, number, number, number];
    readonly minZoom: number;
    readonly maxZoom: number;
    readonly sources: readonly RasterSourceConfig[];
}
