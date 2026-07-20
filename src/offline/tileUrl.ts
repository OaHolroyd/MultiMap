import type { RasterSourceConfig } from '../map/sources';
import type { OfflineSourceSnapshot, TileCoordinate } from './types';

const PLACEHOLDER_PATTERN = /\{(z|x|y)\}/g;

export function buildTileRequestUrl(
    source: Pick<RasterSourceConfig, 'tiles'>,
    coordinates: TileCoordinate
): string {
    const template = source.tiles[0] ?? '';

    return template
        .replaceAll('{z}', String(coordinates.z))
        .replaceAll('{x}', String(coordinates.x))
        .replaceAll('{y}', String(coordinates.y));
}

export function matchRequestUrlToSource(
    requestUrl: string,
    source: OfflineSourceSnapshot
): TileCoordinate | null {
    for (const template of source.tiles) {
        const coordinates = matchRequestUrlToTemplate(requestUrl, template);
        if (coordinates) {
            return coordinates;
        }
    }

    return null;
}

function matchRequestUrlToTemplate(requestUrl: string, template: string): TileCoordinate | null {
    const tokenizedTemplate = template.replace(
        PLACEHOLDER_PATTERN,
        (_, placeholder: string) => `__MULTIMAP_${placeholder.toUpperCase()}__`
    );
    const pattern = `^${escapeRegExp(tokenizedTemplate)
        .replace('__MULTIMAP_Z__', '(?<z>\\d+)')
        .replace('__MULTIMAP_X__', '(?<x>\\d+)')
        .replace('__MULTIMAP_Y__', '(?<y>\\d+)')}$`;
    const matcher = new RegExp(pattern);
    const match = matcher.exec(requestUrl);

    if (!match?.groups) {
        return null;
    }

    const z = Number.parseInt(match.groups.z ?? '', 10);
    const x = Number.parseInt(match.groups.x ?? '', 10);
    const y = Number.parseInt(match.groups.y ?? '', 10);

    if ([z, x, y].some((value) => Number.isNaN(value))) {
        return null;
    }

    return { z, x, y };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
