import { MapController } from '../map/MapController';
import {
    SOURCES_RASTER,
    SOURCES_RASTER_OVERLAYS,
    type RasterSourceConfig
} from '../map/sources';
import compassIcon from '../assets/compass.svg?raw';
import downloadIcon from '../assets/download.svg?raw';
import layersIcon from '../assets/layers.svg?raw';
import locateIcon from '../assets/locate.svg?raw';
import routesIcon from '../assets/routes.svg?raw';
import searchIcon from '../assets/search.svg?raw';
import settingsIcon from '../assets/settings.svg?raw';
import toggleCollapseIcon from '../assets/toggle-collapse.svg?raw';
import toggleExpandIcon from '../assets/toggle-expand.svg?raw';
import viewModeIcon from '../assets/view-mode.svg?raw';

interface CollapsibleControlDefinition {
    readonly id: string;
    readonly label: string;
    readonly icon: string;
    readonly onClickMessage: string;
}

interface ControlClusterDefinition {
    readonly className: string;
    readonly ariaLabel: string;
    readonly controls: readonly CollapsibleControlDefinition[];
}

type LayersPopoverTab = 'base' | 'overlays';

const TOP_LEFT_CONTROLS: readonly CollapsibleControlDefinition[] = [
    {
        id: 'map-search-button',
        label: 'Search',
        icon: searchIcon,
        onClickMessage: 'Search button clicked.'
    }
];

const TOP_RIGHT_CONTROLS: readonly CollapsibleControlDefinition[] = [
    {
        id: 'map-view-mode-button',
        label: 'Toggle 3D and 2D view',
        icon: viewModeIcon,
        onClickMessage: 'View mode button clicked.'
    },
    {
        id: 'map-download-area-button',
        label: 'Download area',
        icon: downloadIcon,
        onClickMessage: 'Download area button clicked.'
    }
];

const BOTTOM_RIGHT_CONTROLS: readonly CollapsibleControlDefinition[] = [
    {
        id: 'map-layers-button',
        label: 'Layers',
        icon: layersIcon,
        onClickMessage: 'Layers button clicked.'
    },
    {
        id: 'map-routes-button',
        label: 'Routes',
        icon: routesIcon,
        onClickMessage: 'Routes button clicked.'
    },
    {
        id: 'map-settings-button',
        label: 'Settings',
        icon: settingsIcon,
        onClickMessage: 'Settings button clicked.'
    }
];

const CONTROL_CLUSTERS: readonly ControlClusterDefinition[] = [
    {
        className: 'map-overlay-cluster--top-left',
        ariaLabel: 'Search controls',
        controls: TOP_LEFT_CONTROLS
    },
    {
        className: 'map-overlay-cluster--top-right',
        ariaLabel: 'View controls',
        controls: TOP_RIGHT_CONTROLS
    }
];

export class AppShell {
    private readonly container: HTMLElement;
    private mapController: MapController | null;
    private controlsExpanded: boolean;
    private northResetVisible: boolean;
    private layersMenuOpen: boolean;
    private activeRasterSourceId: string;
    private activeOverlayIds: string[];
    private layersPopoverTab: LayersPopoverTab;

    constructor(container: HTMLElement) {
        this.container = container;
        this.mapController = null;
        this.controlsExpanded = true;
        this.northResetVisible = false;
        this.layersMenuOpen = false;
        this.activeRasterSourceId = SOURCES_RASTER[0]?.id ?? '';
        this.activeOverlayIds = [];
        this.layersPopoverTab = 'base';
    }

    public init(): void {
        this.render();
        this.mountMap();
        this.bindEvents();
        this.syncLayersPopoverTab();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="app-shell">
                <div id="map-root" class="map-root" aria-label="Map view"></div>

                ${CONTROL_CLUSTERS.map((cluster) => this.renderCollapsibleCluster(cluster)).join('')}

                <div
                    class="map-overlay-cluster map-overlay-cluster--bottom-right ${this.controlsExpanded ? '' : 'is-collapsed'}"
                    aria-label="Map controls"
                >
                    <button
                        id="map-reset-bearing-button"
                        class="map-action-button map-action-button--ephemeral ${this.northResetVisible ? 'is-visible' : ''}"
                        type="button"
                        aria-label="Return map to north up"
                        title="Return map to north up"
                        ${this.northResetVisible ? '' : 'tabindex="-1" aria-hidden="true"'}
                    >
                        ${compassIcon}
                    </button>
                    <button
                        id="map-toggle-controls-button"
                        class="map-action-button"
                        type="button"
                        aria-label="${this.controlsExpanded ? 'Minimise map controls' : 'Expand map controls'}"
                        aria-expanded="${this.controlsExpanded ? 'true' : 'false'}"
                        title="${this.controlsExpanded ? 'Minimise map controls' : 'Expand map controls'}"
                    >
                        ${this.renderToggleIcon()}
                    </button>
                    <button
                        id="map-locate-button"
                        class="map-action-button"
                        type="button"
                        aria-label="Zoom to your location"
                        title="Zoom to your location"
                    >
                        ${locateIcon}
                    </button>
                    ${this.renderLayersPopover()}
                    ${this.renderCollapsibleControls(BOTTOM_RIGHT_CONTROLS)}
                </div>
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
        this.mapController.onBearingChange((bearing) => {
            this.syncNorthResetButton(bearing);
        });
        this.mapController.onActiveSourceChange((source) => {
            this.activeRasterSourceId = source.id;
            this.syncLayersMenuSelection();
        });
        this.mapController.onActiveOverlaysChange((overlayIds) => {
            this.activeOverlayIds = [...overlayIds];
            this.syncLayersMenuSelection();
        });
    }

    private bindEvents(): void {
        const toggleButton = this.container.querySelector<HTMLButtonElement>('#map-toggle-controls-button');
        const resetBearingButton = this.container.querySelector<HTMLButtonElement>('#map-reset-bearing-button');
        const locateButton = this.container.querySelector<HTMLButtonElement>('#map-locate-button');
        const layersButton = this.container.querySelector<HTMLButtonElement>('#map-layers-button');
        const layersPopover = this.container.querySelector<HTMLElement>('#map-layers-popover');
        const baseTabButton = this.container.querySelector<HTMLButtonElement>('#layers-tab-base');
        const overlaysTabButton = this.container.querySelector<HTMLButtonElement>('#layers-tab-overlays');

        toggleButton?.addEventListener('click', () => {
            this.controlsExpanded = !this.controlsExpanded;
            this.syncControlsVisibility();
        });

        resetBearingButton?.addEventListener('click', () => {
            this.mapController?.resetBearing();
        });

        locateButton?.addEventListener('click', async () => {
            if (!this.mapController) {
                return;
            }

            locateButton.disabled = true;
            locateButton.classList.add('is-loading');

            try {
                await this.mapController.zoomToUserPosition();
            } catch (error) {
                console.error('Unable to retrieve user location.', error);
            } finally {
                locateButton.disabled = false;
                locateButton.classList.remove('is-loading');
            }
        });

        layersButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.layersMenuOpen = !this.layersMenuOpen;
            this.syncLayersMenuVisibility();
        });

        layersPopover?.addEventListener('click', (event) => {
            event.stopPropagation();
        });

        baseTabButton?.addEventListener('click', () => {
            this.layersPopoverTab = 'base';
            this.syncLayersPopoverTab();
        });

        overlaysTabButton?.addEventListener('click', () => {
            this.layersPopoverTab = 'overlays';
            this.syncLayersPopoverTab();
        });

        this.bindLayersPopoverEvents();
        this.bindPlaceholderControlHandlers();
        document.addEventListener('click', this.handleDocumentClick);
    }

    private syncControlsVisibility(): void {
        const toggleButton = this.container.querySelector<HTMLButtonElement>('#map-toggle-controls-button');
        const controlClusters = this.container.querySelectorAll<HTMLElement>('.map-overlay-cluster');
        const collapsibleSections = this.container.querySelectorAll<HTMLElement>('.map-secondary-controls');
        const collapsibleButtons = this.container.querySelectorAll<HTMLButtonElement>('.map-action-button--collapsible');

        if (!toggleButton) {
            return;
        }

        controlClusters.forEach((cluster) => {
            cluster.classList.toggle('is-collapsed', !this.controlsExpanded);
        });

        if (!this.controlsExpanded && this.layersMenuOpen) {
            this.layersMenuOpen = false;
            this.syncLayersMenuVisibility();
        }

        collapsibleSections.forEach((section) => {
            section.setAttribute('aria-hidden', this.controlsExpanded ? 'false' : 'true');
        });

        collapsibleButtons.forEach((button) => {
            button.tabIndex = this.controlsExpanded ? 0 : -1;
        });

        const buttonLabel = this.controlsExpanded
            ? 'Minimise map controls'
            : 'Expand map controls';
        toggleButton.setAttribute('aria-label', buttonLabel);
        toggleButton.setAttribute('aria-expanded', this.controlsExpanded ? 'true' : 'false');
        toggleButton.setAttribute('title', buttonLabel);

        // Updating the icon inline keeps the toggle self-contained without
        // requiring a full re-render of the map shell.
        toggleButton.innerHTML = this.renderToggleIcon();
    }

    private syncNorthResetButton(bearing: number): void {
        const resetBearingButton = this.container.querySelector<HTMLButtonElement>('#map-reset-bearing-button');

        if (!resetBearingButton) {
            return;
        }

        // Small floating point drift is common during map animations, so the
        // button appears only once the rotation is visually meaningful.
        const shouldShow = Math.abs(bearing) > 0.5 && Math.abs(bearing - 360) > 0.5;
        this.northResetVisible = shouldShow;

        resetBearingButton.classList.toggle('is-visible', shouldShow);
        resetBearingButton.tabIndex = shouldShow ? 0 : -1;
        resetBearingButton.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    private bindPlaceholderControlHandlers(): void {
        const placeholderControls = [
            ...TOP_LEFT_CONTROLS,
            ...TOP_RIGHT_CONTROLS,
            ...BOTTOM_RIGHT_CONTROLS.filter((control) => control.id !== 'map-layers-button')
        ];

        // Centralizing the placeholder bindings keeps the shell readable now,
        // and gives us one place to swap in real handlers as controls graduate
        // from dummy actions to real features.
        placeholderControls.forEach((control) => {
            this.container
                .querySelector<HTMLButtonElement>(`#${control.id}`)
                ?.addEventListener('click', () => {
                    console.debug(control.onClickMessage);
                });
        });
    }

    private renderCollapsibleCluster(cluster: ControlClusterDefinition): string {
        return `
            <div
                class="map-overlay-cluster ${cluster.className} ${this.controlsExpanded ? '' : 'is-collapsed'}"
                aria-label="${cluster.ariaLabel}"
            >
                ${this.renderCollapsibleControls(cluster.controls)}
            </div>
        `;
    }

    private renderCollapsibleControls(controls: readonly CollapsibleControlDefinition[]): string {
        return `
            <div class="map-secondary-controls" aria-hidden="${this.controlsExpanded ? 'false' : 'true'}">
                <div class="map-secondary-controls__content">
                    ${controls.map((control) => this.renderIconButton(control)).join('')}
                </div>
            </div>
        `;
    }

    private renderIconButton(control: CollapsibleControlDefinition): string {
        return `
            <button
                id="${control.id}"
                class="map-action-button map-action-button--collapsible"
                type="button"
                aria-label="${control.label}"
                title="${control.label}"
                ${this.controlsExpanded ? '' : 'tabindex="-1"'}
            >
                ${control.icon}
            </button>
        `;
    }

    private renderToggleIcon(): string {
        return this.controlsExpanded ? toggleCollapseIcon : toggleExpandIcon;
    }

    private buildSourcePreviewUrl(source: RasterSourceConfig): string {
        const [z, x, y] = source.example_zxy;
        const template = source.tiles[0] ?? '';

        // The preview is derived from the actual tile template so the menu
        // stays in sync with the underlying layer configuration.
        return template
            .replace('{z}', String(z))
            .replace('{x}', String(x))
            .replace('{y}', String(y));
    }

    private renderLayersPopover(): string {
        return `
            <div
                id="map-layers-popover"
                class="layers-popover ${this.layersMenuOpen ? 'is-open' : ''}"
                aria-hidden="${this.layersMenuOpen ? 'false' : 'true'}"
            >
                <div class="layers-popover__header">Layers</div>
                <div class="layers-popover__tabs" role="tablist" aria-label="Layer types">
                    <button
                        id="layers-tab-base"
                        class="layers-popover__tab ${this.layersPopoverTab === 'base' ? 'is-active' : ''}"
                        type="button"
                        role="tab"
                        aria-selected="${this.layersPopoverTab === 'base' ? 'true' : 'false'}"
                    >
                        Base
                    </button>
                    <button
                        id="layers-tab-overlays"
                        class="layers-popover__tab ${this.layersPopoverTab === 'overlays' ? 'is-active' : ''}"
                        type="button"
                        role="tab"
                        aria-selected="${this.layersPopoverTab === 'overlays' ? 'true' : 'false'}"
                    >
                        Overlays
                    </button>
                </div>
                <div
                    class="layers-popover__panel ${this.layersPopoverTab === 'base' ? 'is-active' : ''}"
                    data-panel="base"
                    role="tabpanel"
                    aria-hidden="${this.layersPopoverTab === 'base' ? 'false' : 'true'}"
                >
                    <div class="layers-popover__list" role="menu" aria-label="Available base layers">
                        ${this.renderSourceOptions(SOURCES_RASTER, 'base')}
                    </div>
                </div>
                <div
                    class="layers-popover__panel ${this.layersPopoverTab === 'overlays' ? 'is-active' : ''}"
                    data-panel="overlays"
                    role="tabpanel"
                    aria-hidden="${this.layersPopoverTab === 'overlays' ? 'false' : 'true'}"
                >
                    <div class="layers-popover__list" role="menu" aria-label="Available overlays">
                        ${this.renderSourceOptions(SOURCES_RASTER_OVERLAYS, 'overlay')}
                    </div>
                </div>
            </div>
        `;
    }

    private bindLayersPopoverEvents(): void {
        const optionButtons = this.container.querySelectorAll<HTMLButtonElement>('.layers-popover__option');

        optionButtons.forEach((button) => {
            button.addEventListener('click', async () => {
                const sourceId = button.dataset.sourceId;
                const sourceKind = button.dataset.sourceKind;
                if (!sourceId || !this.mapController) {
                    return;
                }

                if (sourceKind === 'overlay') {
                    await this.mapController.toggleOverlaySource(sourceId);
                    return;
                }

                await this.mapController.setRasterSource(sourceId);
                this.layersMenuOpen = false;
                this.syncLayersMenuVisibility();
            });
        });
    }

    private syncLayersMenuVisibility(): void {
        const popover = this.container.querySelector<HTMLElement>('#map-layers-popover');

        if (!popover) {
            return;
        }

        popover.classList.toggle('is-open', this.layersMenuOpen);
        popover.setAttribute('aria-hidden', this.layersMenuOpen ? 'false' : 'true');
        this.syncLayersPopoverTab();
    }

    private syncLayersPopoverTab(): void {
        const tabButtons = this.container.querySelectorAll<HTMLButtonElement>('.layers-popover__tab');
        const panels = this.container.querySelectorAll<HTMLElement>('.layers-popover__panel');

        tabButtons.forEach((button) => {
            const isActive = button.id === `layers-tab-${this.layersPopoverTab}`;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.panel === this.layersPopoverTab;
            panel.classList.toggle('is-active', isActive);
            panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });
    }

    private syncLayersMenuSelection(): void {
        const optionButtons = this.container.querySelectorAll<HTMLButtonElement>('.layers-popover__option');

        optionButtons.forEach((button) => {
            const sourceKind = button.dataset.sourceKind;
            const sourceId = button.dataset.sourceId ?? '';
            const isActive = sourceKind === 'overlay'
                ? this.activeOverlayIds.includes(sourceId)
                : sourceId === this.activeRasterSourceId;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-checked', isActive ? 'true' : 'false');
        });
    }

    private renderSourceOptions(
        sources: readonly RasterSourceConfig[],
        sourceKind: 'base' | 'overlay'
    ): string {
        return sources.map((source) => {
            const isActive = sourceKind === 'overlay'
                ? this.activeOverlayIds.includes(source.id)
                : source.id === this.activeRasterSourceId;
            const itemRole = sourceKind === 'overlay' ? 'menuitemcheckbox' : 'menuitemradio';

            return `
                <button
                    class="layers-popover__option ${isActive ? 'is-active' : ''}"
                    type="button"
                    data-source-id="${source.id}"
                    data-source-kind="${sourceKind}"
                    role="${itemRole}"
                    aria-checked="${isActive ? 'true' : 'false'}"
                >
                    <img
                        class="layers-popover__preview"
                        src="${this.buildSourcePreviewUrl(source)}"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        crossorigin="anonymous"
                    >
                    <span class="layers-popover__option-copy">
                        <span class="layers-popover__option-label">${source.layerId}</span>
                        <span class="layers-popover__option-meta">${source.attribution || 'No attribution'}</span>
                    </span>
                </button>
            `;
        }).join('');
    }

    private readonly handleDocumentClick = (event: MouseEvent): void => {
        if (!this.layersMenuOpen) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }

        const popover = this.container.querySelector<HTMLElement>('#map-layers-popover');
        const trigger = this.container.querySelector<HTMLButtonElement>('#map-layers-button');

        if (popover?.contains(target) || trigger?.contains(target)) {
            return;
        }

        this.layersMenuOpen = false;
        this.syncLayersMenuVisibility();
    };
}
