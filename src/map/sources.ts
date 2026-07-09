export interface RasterSourceConfig {
    readonly id: string;
    readonly layerId: string;
    readonly tiles: readonly string[];
    readonly tileSize: number;
    readonly attribution: string;
}

// Keeping the source definition separate from the controller makes it easier
// to swap in additional base maps later without rewriting map lifecycle code.
export const DEFAULT_RASTER_SOURCE: RasterSourceConfig = {
    id: 'base-raster-source',
    layerId: 'base-raster-layer',
    tiles: ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
    tileSize: 256,
    attribution: '© OpenTopoMap contributors'
};
