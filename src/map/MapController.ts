import maplibregl, { type Map } from 'maplibre-gl';

import { DEFAULT_RASTER_SOURCE } from './sources';

export class MapController {
    private readonly container: HTMLElement;
    private map: Map | null;
    private userLocationMarker: maplibregl.Marker | null;
    private readonly mapReadyPromise: Promise<void>;
    private resolveMapReady: (() => void) | null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.map = null;
        this.userLocationMarker = null;
        this.resolveMapReady = null;
        this.mapReadyPromise = new Promise((resolve) => {
            this.resolveMapReady = resolve;
        });
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

        // this.map.addControl(new maplibregl.NavigationControl(), 'top-right');

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

            this.resolveMapReady?.();
          this.resolveMapReady = null;
        });
    }

    public async zoomToUserPosition(): Promise<void> {
        if (!('geolocation' in navigator)) {
            throw new Error('Geolocation is not available in this browser.');
        }

        await this.mapReadyPromise;

        const position = await this.getCurrentPosition();
        const userCoordinates: [number, number] = [
            position.coords.longitude,
            position.coords.latitude
        ];

        this.renderUserLocation(userCoordinates);

        // Flying to the reported position keeps the custom locate action
        // visually aligned with what users expect from native map controls.
        this.map?.flyTo({
            center: userCoordinates,
            zoom: Math.max(this.map.getZoom(), 14),
            essential: true
        });
    }

    private async getCurrentPosition(): Promise<GeolocationPosition> {
        return await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
    }

    private renderUserLocation(coordinates: [number, number]): void {
        if (!this.map) {
            return;
        }

        if (!this.userLocationMarker) {
            const markerElement = document.createElement('div');
            markerElement.className = 'user-location-marker';

            // The marker is a DOM element so we can style it consistently with
            // the rest of the shell instead of relying on a library default.
            this.userLocationMarker = new maplibregl.Marker({
                element: markerElement
            });
        }

        this.userLocationMarker
            .setLngLat(coordinates)
            .addTo(this.map);
    }
}
