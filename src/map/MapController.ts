import maplibregl, { type Map } from 'maplibre-gl';

import { DEFAULT_RASTER_SOURCE } from './sources';

export class MapController {
    private readonly container: HTMLElement;
    private map: Map | null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.map = null;
    }

    public init(): void {
        // MapLibre requires a style document at construction time. We start
        // with an empty style and attach the raster source/layer once the map
        // has finished booting.
        this.map = new maplibregl.Map({
            container: this.container,
            center: [-3.1883, 55.9533],
            zoom: 8,
            attributionControl: {
                compact: true
            },
            style: {
                version: 8,
                sources: {},
                layers: []
            }
        });

        this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

        this.map.on('load', () => {
            if (!this.map) {
                return;
            }

            this.map.addSource(DEFAULT_RASTER_SOURCE.id, {
                type: 'raster',
                tiles: [...DEFAULT_RASTER_SOURCE.tiles],
                tileSize: DEFAULT_RASTER_SOURCE.tileSize,
                attribution: DEFAULT_RASTER_SOURCE.attribution
            });

            this.map.addLayer({
                id: DEFAULT_RASTER_SOURCE.layerId,
                type: 'raster',
                source: DEFAULT_RASTER_SOURCE.id
            });
        });
    }
}
