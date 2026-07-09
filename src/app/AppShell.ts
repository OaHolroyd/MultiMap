import { MapController } from '../map/MapController';

export class AppShell {
    private readonly container: HTMLElement;
    private mapController: MapController | null;

    constructor(container: HTMLElement) {
        this.container = container;
        this.mapController = null;
    }

    public init(): void {
        this.render();
        this.mountMap();
        this.bindEvents();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="app-shell">
                <div id="map-root" class="map-root" aria-label="Map view"></div>
                <button
                    id="map-action-button"
                    class="map-action-button"
                    type="button"
                    aria-label="Map tools"
                    title="Map tools"
                >
                    Tools
                </button>
            </div>
        `;
    }

    private mountMap(): void {
        const mapRoot = this.container.querySelector<HTMLElement>('#map-root');

        if (!mapRoot) {
            throw new Error('Map root container was not rendered.');
        }

        // The shell owns the page structure, while the controller owns the
        // MapLibre instance and future map-specific behaviors.
        this.mapController = new MapController(mapRoot);
        this.mapController.init();
    }

    private bindEvents(): void {
        const button = this.container.querySelector<HTMLButtonElement>('#map-action-button');

        if (!button) {
            return;
        }

        // This is intentionally a no-op for now. The button is part of the
        // overlay layout and will grow into the map controls later.
        button.addEventListener('click', () => {
            console.debug('Map tools button clicked.');
        });
    }
}
