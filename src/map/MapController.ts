import maplibregl, { type Map } from 'maplibre-gl';

import {
    DEFAULT_RASTER_SOURCE,
    SOURCES_RASTER,
    SOURCES_RASTER_OVERLAYS,
    type RasterSourceConfig
} from './sources';

export class MapController {
    private readonly container: HTMLElement;
    private map: Map | null;
    private userLocationMarker: maplibregl.Marker | null;
    private readonly mapReadyPromise: Promise<void>;
    private resolveMapReady: (() => void) | null;
    private readonly bearingChangeListeners: Array<(bearing: number) => void>;
    private readonly activeSourceChangeListeners: Array<(source: RasterSourceConfig) => void>;
    private readonly activeOverlayChangeListeners: Array<(overlayIds: readonly string[]) => void>;
    private activeRasterSource: RasterSourceConfig;
    private activeOverlayIds: string[];

    constructor(container: HTMLElement) {
        this.container = container;
        this.map = null;
        this.userLocationMarker = null;
        this.resolveMapReady = null;
        this.bearingChangeListeners = [];
        this.activeSourceChangeListeners = [];
        this.activeOverlayChangeListeners = [];
        this.activeRasterSource = DEFAULT_RASTER_SOURCE;
        this.activeOverlayIds = [];
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
            attributionControl: false,
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

            this.applyRasterSource(this.activeRasterSource);

            this.resolveMapReady?.();
            this.resolveMapReady = null;
            this.notifyBearingChange();
            this.notifyActiveSourceChange();
            this.notifyActiveOverlayChange();
        });

        // The shell needs to know when the map is rotated so it can surface a
        // temporary north-up control without owning any map internals itself.
        this.map.on('rotate', () => {
            this.notifyBearingChange();
        });
    }

    public onBearingChange(listener: (bearing: number) => void): void {
        this.bearingChangeListeners.push(listener);

        if (this.map) {
            listener(this.getNormalizedBearing());
        }
    }

    public resetBearing(): void {
        this.map?.easeTo({
            bearing: 0,
            duration: 250,
            essential: true
        });
    }

    public onActiveSourceChange(listener: (source: RasterSourceConfig) => void): void {
        this.activeSourceChangeListeners.push(listener);
        listener(this.activeRasterSource);
    }

    public onActiveOverlaysChange(listener: (overlayIds: readonly string[]) => void): void {
        this.activeOverlayChangeListeners.push(listener);
        listener([...this.activeOverlayIds]);
    }

    public async setRasterSource(sourceId: string): Promise<void> {
        await this.mapReadyPromise;

        const nextSource = SOURCES_RASTER.find((source) => source.id === sourceId);
        if (!nextSource || !this.map) {
            return;
        }

        this.activeRasterSource = nextSource;

        // Clear all known base raster layers before adding the next one. This
        // is more robust than only removing the previously tracked source,
        // because it guarantees the style cannot drift into a stacked state.
        this.removeAllRasterSources();
        this.applyRasterSource(nextSource);
        this.notifyActiveSourceChange();
    }

    public async toggleOverlaySource(sourceId: string): Promise<void> {
        await this.mapReadyPromise;

        const overlaySource = SOURCES_RASTER_OVERLAYS.find((source) => source.id === sourceId);
        if (!overlaySource || !this.map) {
            return;
        }

        const isActive = this.activeOverlayIds.includes(sourceId);

        if (isActive) {
            this.removeRasterSource(overlaySource);
            this.activeOverlayIds = this.activeOverlayIds.filter((id) => id !== sourceId);
        } else {
            this.applyRasterSource(overlaySource);
            this.activeOverlayIds = [...this.activeOverlayIds, sourceId];
        }

        this.notifyActiveOverlayChange();
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

    private applyRasterSource(source: RasterSourceConfig): void {
        if (!this.map) {
            return;
        }

        this.map.addSource(source.id, {
            type: 'raster',
            tiles: [...source.tiles],
            tileSize: source.tileSize,
            attribution: source.attribution
        });

        const beforeLayerId = SOURCES_RASTER_OVERLAYS.some((overlay) => overlay.id === source.id)
            ? undefined
            : this.getFirstActiveOverlayLayerId();

        this.map.addLayer({
            id: source.layerId,
            type: 'raster',
            source: source.id
        }, beforeLayerId);
    }

    private removeRasterSource(source: RasterSourceConfig): void {
        if (!this.map) {
            return;
        }

        if (this.map.getLayer(source.layerId)) {
            this.map.removeLayer(source.layerId);
        }

        if (this.map.getSource(source.id)) {
            this.map.removeSource(source.id);
        }
    }

    private removeAllRasterSources(): void {
        if (!this.map) {
            return;
        }

        SOURCES_RASTER.forEach((source) => {
            this.removeRasterSource(source);
        });
    }

    private notifyBearingChange(): void {
        const bearing = this.getNormalizedBearing();
        this.bearingChangeListeners.forEach((listener) => {
            listener(bearing);
        });
    }

    private notifyActiveSourceChange(): void {
        this.activeSourceChangeListeners.forEach((listener) => {
            listener(this.activeRasterSource);
        });
    }

    private notifyActiveOverlayChange(): void {
        const activeOverlayIds = [...this.activeOverlayIds];
        this.activeOverlayChangeListeners.forEach((listener) => {
            listener(activeOverlayIds);
        });
    }

    private getFirstActiveOverlayLayerId(): string | undefined {
        if (!this.map) {
            return undefined;
        }

        for (const overlayId of this.activeOverlayIds) {
            const overlaySource = SOURCES_RASTER_OVERLAYS.find((source) => source.id === overlayId);
            if (overlaySource && this.map.getLayer(overlaySource.layerId)) {
                return overlaySource.layerId;
            }
        }

        return undefined;
    }

    private getNormalizedBearing(): number {
        if (!this.map) {
            return 0;
        }

        const bearing = this.map.getBearing();

        return ((bearing % 360) + 360) % 360;
    }
}
