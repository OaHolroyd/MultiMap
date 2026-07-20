import type { RasterSourceConfig } from '../map/sources';
import type { TileCoordinate } from './types';

const MAX_LATITUDE = 85.051129;

export function enumerateViewportTiles(
    bounds: [number, number, number, number],
    source: RasterSourceConfig,
    minZoom: number,
    maxZoom: number
): TileCoordinate[] {
    const normalizedBounds = normalizeBounds(bounds);
    const latitudeRange = intersectLatitudeRange(normalizedBounds, source.bounds);
    const longitudeRanges = intersectLongitudeRanges(normalizedBounds, source.bounds);

    if (!latitudeRange || longitudeRanges.length === 0) {
        return [];
    }

    const [sourceMinZoom, sourceMaxZoom] = source.zlims;
    const startZoom = clampInteger(minZoom, sourceMinZoom, sourceMaxZoom);
    const endZoom = clampInteger(maxZoom, sourceMinZoom, sourceMaxZoom);

    if (endZoom < startZoom) {
        return [];
    }

    const coordinates: TileCoordinate[] = [];

    for (let zoom = startZoom; zoom <= endZoom; zoom += 1) {
        longitudeRanges.forEach(([west, east]) => {
            const xMin = clampTileIndex(longitudeToTileX(west, zoom), zoom);
            const xMax = clampTileIndex(longitudeToTileX(east, zoom), zoom);
            const yMin = clampTileIndex(latitudeToTileY(latitudeRange[1], zoom), zoom);
            const yMax = clampTileIndex(latitudeToTileY(latitudeRange[0], zoom), zoom);

            for (let x = Math.min(xMin, xMax); x <= Math.max(xMin, xMax); x += 1) {
                for (let y = Math.min(yMin, yMax); y <= Math.max(yMin, yMax); y += 1) {
                    coordinates.push({ z: zoom, x, y });
                }
            }
        });
    }

    return deduplicateTileCoordinates(coordinates);
}

function normalizeBounds(bounds: [number, number, number, number]): [number, number, number, number] {
    return [
        normalizeLongitude(bounds[0]),
        clampLatitude(bounds[1]),
        normalizeLongitude(bounds[2]),
        clampLatitude(bounds[3])
    ];
}

function enumerateLongitudeRanges(west: number, east: number): Array<[number, number]> {
    if (east >= west) {
        return [[west, east]];
    }

    return [
        [west, 180],
        [-180, east]
    ];
}

function intersectLatitudeRange(
    targetBounds: [number, number, number, number],
    sourceBounds: [number, number, number, number] | null
): [number, number] | null {
    if (!sourceBounds) {
        return [targetBounds[1], targetBounds[3]];
    }

    const south = Math.max(targetBounds[1], sourceBounds[1]);
    const north = Math.min(targetBounds[3], sourceBounds[3]);

    if (south >= north) {
        return null;
    }

    return [south, north];
}

function intersectLongitudeRanges(
    targetBounds: [number, number, number, number],
    sourceBounds: [number, number, number, number] | null
): Array<[number, number]> {
    const targetRanges = enumerateLongitudeRanges(targetBounds[0], targetBounds[2]);
    const sourceRanges = sourceBounds
        ? enumerateLongitudeRanges(
            normalizeLongitude(sourceBounds[0]),
            normalizeLongitude(sourceBounds[2])
        )
        : [[-180, 180] as [number, number]];

    const intersections: Array<[number, number]> = [];

    targetRanges.forEach(([targetWest, targetEast]) => {
        sourceRanges.forEach(([sourceWest, sourceEast]) => {
            const west = Math.max(targetWest, sourceWest);
            const east = Math.min(targetEast, sourceEast);

            if (west < east) {
                intersections.push([west, east]);
            }
        });
    });

    return intersections;
}

function longitudeToTileX(longitude: number, zoom: number): number {
    const worldSize = 2 ** zoom;
    const projected = ((longitude + 180) / 360) * worldSize;
    return Math.floor(projected);
}

function latitudeToTileY(latitude: number, zoom: number): number {
    const worldSize = 2 ** zoom;
    const latitudeRadians = (clampLatitude(latitude) * Math.PI) / 180;
    const mercatorProjection = (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2;
    return Math.floor(mercatorProjection * worldSize);
}

function clampTileIndex(index: number, zoom: number): number {
    const maxIndex = (2 ** zoom) - 1;
    return Math.max(0, Math.min(maxIndex, index));
}

function clampLatitude(latitude: number): number {
    return Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
}

function normalizeLongitude(longitude: number): number {
    let normalizedLongitude = longitude;

    while (normalizedLongitude > 180) {
        normalizedLongitude -= 360;
    }

    while (normalizedLongitude < -180) {
        normalizedLongitude += 360;
    }

    return normalizedLongitude;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function deduplicateTileCoordinates(coordinates: readonly TileCoordinate[]): TileCoordinate[] {
    const uniqueCoordinates = new Map<string, TileCoordinate>();

    coordinates.forEach((coordinate) => {
        uniqueCoordinates.set(`${coordinate.z}/${coordinate.x}/${coordinate.y}`, coordinate);
    });

    return [...uniqueCoordinates.values()];
}
