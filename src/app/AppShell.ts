import { MapController } from '../map/MapController';
import {
    appendCustomRasterSources,
    deleteCustomRasterSource,
    findRasterSourceById,
    getAllRasterSources,
    getBaseRasterSources,
    getOverlayRasterSources,
    getSourceCatalogState,
    isCustomRasterSource,
    parseRasterSourceImport,
    setRasterSourceOrder,
    type RasterSourceConfig
} from '../map/sources';
import { loadSourceCatalog, saveSourceCatalog } from '../map/sourceStorage';
import { loadLayerSelection, saveLayerSelection } from '../map/storage';
import type { LayerSelectionState } from '../map/layerSelection';
import {
    createViewportDownloadPlan,
    deleteAllOfflineDownloads,
    deleteOfflineDownload,
    downloadViewportTiles,
    getDefaultDownloadMaxZoom,
    getDownloadTileWarningCount,
    listOfflineDownloads,
    syncOfflineSourceCatalog
} from '../offline/tileCache';
import { syncOfflineServiceWorkerConfig } from '../offline/serviceWorkerBridge';
import type { OfflineDownloadJob } from '../offline/types';
import { loadSettings, saveSettings } from '../settings/storage';
import {
    type AppTheme,
    type AppSettings,
    type SettingsPopoverTab
} from '../settings/settings';
import compassIcon from '../assets/compass.svg?raw';
import closeIcon from '../assets/close.svg?raw';
import deleteIcon from '../assets/delete.svg?raw';
import dragHandleIcon from '../assets/drag-handle.svg?raw';
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

interface SettingsDragState {
    readonly pointerId: number;
    readonly sourceId: string;
    readonly sourceKind: 'base' | 'overlay';
    readonly list: HTMLElement;
    readonly item: HTMLElement;
    readonly startPointerY: number;
    readonly scrollOrigin: number;
    baseShiftY: number;
}

interface SettingsSwipeState {
    readonly pointerId: number;
    readonly sourceId: string;
    readonly item: HTMLElement;
    readonly startPointerX: number;
    readonly startPointerY: number;
    engaged: boolean;
    offsetX: number;
}

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
    private settingsMenuOpen: boolean;
    private activeRasterSourceId: string;
    private activeOverlayIds: string[];
    private layersPopoverTab: LayersPopoverTab;
    private settingsPopoverTab: SettingsPopoverTab;
    private settings: AppSettings;
    private layerSelection: LayerSelectionState;
    private offlineDownloads: OfflineDownloadJob[];
    private offlineDownloadInProgress: boolean;
    private settingsDragState: SettingsDragState | null;
    private settingsSwipeState: SettingsSwipeState | null;
    private suppressSettingsClick: boolean;

    constructor(container: HTMLElement) {
        this.container = container;
        this.mapController = null;
        this.controlsExpanded = true;
        this.northResetVisible = false;
        this.layersMenuOpen = false;
        this.settingsMenuOpen = false;
        this.settingsDragState = null;
        this.settingsSwipeState = null;
        this.suppressSettingsClick = false;
        this.offlineDownloads = [];
        this.offlineDownloadInProgress = false;
        loadSourceCatalog();
        this.settings = loadSettings();
        this.layerSelection = loadLayerSelection(this.settings);
        this.activeRasterSourceId = this.layerSelection.activeBaseLayerId;
        this.activeOverlayIds = [...this.layerSelection.activeOverlayIds];
        this.layersPopoverTab = 'base';
        this.settingsPopoverTab = 'layers';
    }

    public init(): void {
        this.render();
        this.applyThemePreference(this.settings.theme);
        this.mountMap();
        this.bindEvents();
        this.syncLayersPopoverTab();
        this.syncSettingsToggleControls();
        void this.initializeOfflineState();
    }

    private render(): void {
        this.container.innerHTML = `
            <div class="app-shell">
                <div id="map-root" class="map-root" aria-label="Map view"></div>

                ${CONTROL_CLUSTERS.map((cluster) => this.renderCollapsibleCluster(cluster)).join('')}

                ${this.renderLayersPopover()}
                ${this.renderSettingsPopover()}

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
        this.mapController = new MapController(
            mapRoot,
            this.activeRasterSourceId,
            this.activeOverlayIds
        );
        this.mapController.init();
        this.mapController.onBearingChange((bearing) => {
            this.syncNorthResetButton(bearing);
        });
        this.mapController.onActiveSourceChange((source) => {
            this.activeRasterSourceId = source.id;
            this.persistLayerSelection();
            this.syncLayersMenuSelection();
        });
        this.mapController.onActiveOverlaysChange((overlayIds) => {
            this.activeOverlayIds = [...overlayIds];
            this.persistLayerSelection();
            this.syncLayersMenuSelection();
        });
    }

    private bindEvents(): void {
        const toggleButton = this.container.querySelector<HTMLButtonElement>('#map-toggle-controls-button');
        const resetBearingButton = this.container.querySelector<HTMLButtonElement>('#map-reset-bearing-button');
        const locateButton = this.container.querySelector<HTMLButtonElement>('#map-locate-button');
        const layersButton = this.container.querySelector<HTMLButtonElement>('#map-layers-button');
        const downloadButton = this.container.querySelector<HTMLButtonElement>('#map-download-area-button');
        const settingsButton = this.container.querySelector<HTMLButtonElement>('#map-settings-button');
        const importLayersButton = this.container.querySelector<HTMLButtonElement>('#settings-import-layers-button');
        const importLayersInput = this.container.querySelector<HTMLInputElement>('#settings-import-layers-input');
        const layersBackdrop = this.container.querySelector<HTMLElement>('#map-layers-backdrop');
        const settingsBackdrop = this.container.querySelector<HTMLElement>('#map-settings-backdrop');
        const layersPopover = this.container.querySelector<HTMLElement>('#map-layers-popover');
        const settingsPopover = this.container.querySelector<HTMLElement>('#map-settings-popover');
        const closeLayersButton = this.container.querySelector<HTMLButtonElement>('#map-layers-close-button');
        const closeSettingsButton = this.container.querySelector<HTMLButtonElement>('#map-settings-close-button');

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
            this.settingsMenuOpen = false;
            this.syncSettingsMenuVisibility();
            this.layersMenuOpen = !this.layersMenuOpen;
            this.syncLayersMenuVisibility();
        });

        downloadButton?.addEventListener('click', async () => {
            await this.handleViewportDownloadRequest(downloadButton);
        });

        settingsButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.layersMenuOpen = false;
            this.syncLayersMenuVisibility();
            this.settingsMenuOpen = !this.settingsMenuOpen;
            this.syncSettingsMenuVisibility();
        });

        layersBackdrop?.addEventListener('click', () => {
            this.layersMenuOpen = false;
            this.syncLayersMenuVisibility();
        });

        settingsBackdrop?.addEventListener('click', () => {
            this.settingsMenuOpen = false;
            this.syncSettingsMenuVisibility();
        });

        layersPopover?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleLayersPopoverClick(event);
        });

        settingsPopover?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.handleSettingsPopoverClick(event);
        });

        settingsPopover?.addEventListener('pointerdown', (event) => {
            this.handleSettingsPointerDown(event);
        });

        closeLayersButton?.addEventListener('click', () => {
            this.layersMenuOpen = false;
            this.syncLayersMenuVisibility();
        });

        closeSettingsButton?.addEventListener('click', () => {
            this.settingsMenuOpen = false;
            this.syncSettingsMenuVisibility();
        });

        importLayersButton?.addEventListener('click', () => {
            importLayersInput?.click();
        });

        importLayersInput?.addEventListener('change', async () => {
            const [file] = Array.from(importLayersInput.files ?? []);
            if (!file) {
                return;
            }

            try {
                await this.importLayersFromFile(file);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to import layer definitions.';
                window.alert(message);
            } finally {
                importLayersInput.value = '';
            }
        });

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

        if (!this.controlsExpanded && this.settingsMenuOpen) {
            this.settingsMenuOpen = false;
            this.syncSettingsMenuVisibility();
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
            ...BOTTOM_RIGHT_CONTROLS.filter((control) =>
                !['map-layers-button', 'map-settings-button'].includes(control.id)
            )
        ].filter((control) => control.id !== 'map-download-area-button');

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
                id="map-layers-backdrop"
                class="map-surface-backdrop map-surface-backdrop--layers ${this.layersMenuOpen ? 'is-open' : ''}"
                aria-hidden="${this.layersMenuOpen ? 'false' : 'true'}"
            ></div>
            <div
                id="map-layers-popover"
                class="map-surface layers-popover ${this.layersMenuOpen ? 'is-open' : ''}"
                role="dialog"
                aria-modal="true"
                aria-labelledby="map-layers-title"
                aria-hidden="${this.layersMenuOpen ? 'false' : 'true'}"
            >
                <div class="map-surface__header map-surface__header--sheet">
                    <div class="map-surface__sheet-handle" aria-hidden="true"></div>
                    <div class="map-surface__header-row">
                        <div id="map-layers-title" class="map-surface__title">Layers</div>
                        <button
                            id="map-layers-close-button"
                            class="map-surface__close-button"
                            type="button"
                            aria-label="Close layers"
                            title="Close layers"
                        >
                            ${closeIcon}
                        </button>
                    </div>
                </div>
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
                    <div
                        id="layers-popover-base-list"
                        class="layers-popover__list"
                        role="menu"
                        aria-label="Available base layers"
                    >
                        ${this.renderSourceOptions(this.getEnabledBaseSources(), 'base')}
                    </div>
                </div>
                <div
                    class="layers-popover__panel ${this.layersPopoverTab === 'overlays' ? 'is-active' : ''}"
                    data-panel="overlays"
                    role="tabpanel"
                    aria-hidden="${this.layersPopoverTab === 'overlays' ? 'false' : 'true'}"
                >
                    <div
                        id="layers-popover-overlay-list"
                        class="layers-popover__list"
                        role="menu"
                        aria-label="Available overlays"
                    >
                        ${this.renderSourceOptions(this.getEnabledOverlaySources(), 'overlay')}
                    </div>
                </div>
            </div>
        `;
    }

    private renderSettingsPopover(): string {
        return `
            <div
                id="map-settings-backdrop"
                class="map-surface-backdrop map-surface-backdrop--settings ${this.settingsMenuOpen ? 'is-open' : ''}"
                aria-hidden="${this.settingsMenuOpen ? 'false' : 'true'}"
            ></div>
            <div
                id="map-settings-popover"
                class="map-surface settings-popover ${this.settingsMenuOpen ? 'is-open' : ''}"
                role="dialog"
                aria-modal="true"
                aria-labelledby="map-settings-title"
                aria-hidden="${this.settingsMenuOpen ? 'false' : 'true'}"
            >
                <div class="map-surface__header">
                    <div class="map-surface__header-row">
                        <div id="map-settings-title" class="map-surface__title">Settings</div>
                        <button
                            id="map-settings-close-button"
                            class="map-surface__close-button"
                            type="button"
                            aria-label="Close settings"
                            title="Close settings"
                        >
                            ${closeIcon}
                        </button>
                    </div>
                </div>
                <div class="settings-popover__tabs" role="tablist" aria-label="Settings sections">
                    ${this.renderSettingsTabButton('general', settingsIcon, 'General settings')}
                    ${this.renderSettingsTabButton('layers', layersIcon, 'Layer settings')}
                    ${this.renderSettingsTabButton('routes', routesIcon, 'Route settings')}
                    ${this.renderSettingsTabButton('downloads', downloadIcon, 'Download settings')}
                </div>
                ${this.renderSettingsPopoverPanel('general', `
                    <div class="settings-popover__section">
                        <button
                            id="settings-theme-toggle"
                            class="settings-popover__toggle"
                            type="button"
                            role="switch"
                            aria-checked="${this.settings.theme === 'light' ? 'true' : 'false'}"
                            title="Toggle light mode"
                        >
                            <span class="settings-popover__toggle-copy">
                                <span class="settings-popover__toggle-label">Light mode</span>
                                <span class="settings-popover__toggle-meta">Switch the app between dark and light themes.</span>
                            </span>
                            <span class="settings-popover__toggle-track" aria-hidden="true">
                                <span class="settings-popover__toggle-thumb"></span>
                            </span>
                        </button>
                        <button
                            id="settings-offline-mode-toggle"
                            class="settings-popover__toggle"
                            type="button"
                            role="switch"
                            aria-checked="${this.settings.offlineMode ? 'true' : 'false'}"
                            title="Toggle offline mode"
                        >
                            <span class="settings-popover__toggle-copy">
                                <span class="settings-popover__toggle-label">Offline mode</span>
                                <span class="settings-popover__toggle-meta">Only use locally downloaded tiles and block external fetches.</span>
                            </span>
                            <span class="settings-popover__toggle-track" aria-hidden="true">
                                <span class="settings-popover__toggle-thumb"></span>
                            </span>
                        </button>
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('layers', `
                    <div class="settings-popover__actions">
                        <button
                            id="settings-import-layers-button"
                            class="settings-popover__action-button"
                            type="button"
                        >
                            Add layers
                        </button>
                        <input
                            id="settings-import-layers-input"
                            class="settings-popover__file-input"
                            type="file"
                            accept="application/json,.json"
                        >
                    </div>
                    <div class="settings-popover__section">
                        <div class="settings-popover__section-label">Base layers</div>
                        <div id="settings-base-layer-list" class="settings-popover__list">
                            ${this.renderSettingsSourceAvailabilityOptions(getBaseRasterSources(), 'base')}
                        </div>
                    </div>
                    <div class="settings-popover__section">
                        <div class="settings-popover__section-label">Overlays</div>
                        <div id="settings-overlay-layer-list" class="settings-popover__list">
                            ${this.renderSettingsSourceAvailabilityOptions(getOverlayRasterSources(), 'overlay')}
                        </div>
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('routes', `
                    <div class="settings-popover__placeholder">
                        Route settings will be added here.
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('downloads', `
                    <div class="settings-popover__section">
                        <button
                            id="settings-tint-offline-tiles-toggle"
                            class="settings-popover__toggle"
                            type="button"
                            role="switch"
                            aria-checked="${this.settings.tintOfflineTiles ? 'true' : 'false'}"
                            title="Toggle offline tile tint"
                        >
                            <span class="settings-popover__toggle-copy">
                                <span class="settings-popover__toggle-label">Tint offline tiles</span>
                                <span class="settings-popover__toggle-meta">Highlight downloaded tiles in green to verify offline coverage.</span>
                            </span>
                            <span class="settings-popover__toggle-track" aria-hidden="true">
                                <span class="settings-popover__toggle-thumb"></span>
                            </span>
                        </button>
                    </div>
                    <div class="settings-popover__actions">
                        <button
                            id="settings-delete-all-downloads-button"
                            class="settings-popover__action-button settings-popover__action-button--danger"
                            type="button"
                            ${this.offlineDownloads.length === 0 || this.offlineDownloadInProgress ? 'disabled' : ''}
                        >
                            Delete all
                        </button>
                    </div>
                    <div id="settings-download-list" class="settings-popover__list">
                        ${this.renderOfflineDownloadRows()}
                    </div>
                    <div class="settings-popover__placeholder">
                        Use the map download button to save the current viewport for the active base layer and overlays.
                    </div>
                `)}
            </div>
        `;
    }

    private syncLayersMenuVisibility(): void {
        const backdrop = this.container.querySelector<HTMLElement>('#map-layers-backdrop');
        const popover = this.container.querySelector<HTMLElement>('#map-layers-popover');

        if (!popover || !backdrop) {
            return;
        }

        backdrop.classList.toggle('is-open', this.layersMenuOpen);
        backdrop.setAttribute('aria-hidden', this.layersMenuOpen ? 'false' : 'true');
        popover.classList.toggle('is-open', this.layersMenuOpen);
        popover.setAttribute('aria-hidden', this.layersMenuOpen ? 'false' : 'true');
        this.syncLayersPopoverTab();
        this.refreshLayerSelectionMenu();
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

    private syncSettingsMenuVisibility(): void {
        const backdrop = this.container.querySelector<HTMLElement>('#map-settings-backdrop');
        const popover = this.container.querySelector<HTMLElement>('#map-settings-popover');

        if (!popover || !backdrop) {
            return;
        }

        backdrop.classList.toggle('is-open', this.settingsMenuOpen);
        backdrop.setAttribute('aria-hidden', this.settingsMenuOpen ? 'false' : 'true');
        popover.classList.toggle('is-open', this.settingsMenuOpen);
        popover.setAttribute('aria-hidden', this.settingsMenuOpen ? 'false' : 'true');
        this.syncSettingsPopoverTab();
        this.refreshSettingsLayersPanel();
        this.refreshDownloadsPanel();
    }

    private syncSettingsPopoverTab(): void {
        const tabButtons = this.container.querySelectorAll<HTMLButtonElement>('.settings-popover__tab');
        const panels = this.container.querySelectorAll<HTMLElement>('.settings-popover__panel');

        tabButtons.forEach((button) => {
            const isActive = button.dataset.panel === this.settingsPopoverTab;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });

        panels.forEach((panel) => {
            const isActive = panel.dataset.panel === this.settingsPopoverTab;
            panel.classList.toggle('is-active', isActive);
            panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        });

        this.syncSettingsToggleControls();
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

    private renderSettingsTabButton(
        tab: SettingsPopoverTab,
        icon: string,
        label: string
    ): string {
        const isActive = this.settingsPopoverTab === tab;

        return `
            <button
                class="settings-popover__tab ${isActive ? 'is-active' : ''}"
                type="button"
                data-panel="${tab}"
                role="tab"
                aria-label="${label}"
                aria-selected="${isActive ? 'true' : 'false'}"
                title="${label}"
            >
                ${icon}
            </button>
        `;
    }

    private renderSettingsPopoverPanel(tab: SettingsPopoverTab, content: string): string {
        const isActive = this.settingsPopoverTab === tab;

        return `
            <div
                class="settings-popover__panel ${isActive ? 'is-active' : ''}"
                data-panel="${tab}"
                role="tabpanel"
                aria-hidden="${isActive ? 'false' : 'true'}"
            >
                ${content}
            </div>
        `;
    }

    private renderSettingsSourceAvailabilityOptions(
        sources: readonly RasterSourceConfig[],
        sourceKind: 'base' | 'overlay'
    ): string {
        const enabledIds = sourceKind === 'base'
            ? this.settings.enabledBaseLayerIds
            : this.settings.enabledOverlayIds;
        const lastEnabledBaseId = sourceKind === 'base' && enabledIds.length === 1
            ? enabledIds[0]
            : null;

        return sources.map((source) => {
            const isEnabled = enabledIds.includes(source.id);
            const isRequiredBase = sourceKind === 'base' && lastEnabledBaseId === source.id;
            const isCustom = isCustomRasterSource(source.id);
            const itemClasses = [
                'settings-popover__item',
                isEnabled ? 'is-enabled' : 'is-disabled',
                isCustom ? 'is-custom' : 'is-default'
            ].join(' ');

            return `
                <div
                    class="${itemClasses}"
                    data-settings-source-id="${source.id}"
                    data-settings-source-kind="${sourceKind}"
                >
                    <button
                        class="settings-popover__handle"
                        type="button"
                        aria-label="Drag to reorder ${source.layerId}"
                        title="Drag to reorder ${source.layerId}"
                        tabindex="-1"
                    >
                        ${dragHandleIcon}
                    </button>
                    <button
                        class="settings-popover__option"
                        type="button"
                        data-settings-source-id="${source.id}"
                        data-settings-source-kind="${sourceKind}"
                        aria-pressed="${isEnabled ? 'true' : 'false'}"
                        ${isRequiredBase ? 'disabled' : ''}
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
                    ${isCustom ? `
                        <button
                            class="settings-popover__delete-button"
                            type="button"
                            data-delete-source-id="${source.id}"
                            aria-label="Delete ${source.layerId}"
                            title="Delete ${source.layerId}"
                        >
                            ${deleteIcon}
                        </button>
                    ` : '<span class="settings-popover__delete-spacer" aria-hidden="true"></span>'}
                </div>
            `;
        }).join('');
    }

    private renderOfflineDownloadRows(): string {
        if (this.offlineDownloads.length === 0) {
            return `
                <div class="settings-popover__placeholder">
                    No offline areas have been downloaded yet.
                </div>
            `;
        }

        return this.offlineDownloads.map((download) => `
            <div class="settings-popover__download-row">
                <div class="settings-popover__download-copy">
                    <div class="settings-popover__download-name">${download.name}</div>
                    <div class="settings-popover__download-meta">${this.formatDownloadMeta(download)}</div>
                </div>
                <button
                    class="settings-popover__delete-button settings-popover__delete-button--danger"
                    type="button"
                    data-delete-download-id="${download.id}"
                    aria-label="Delete download ${download.name}"
                    title="Delete download ${download.name}"
                    ${this.offlineDownloadInProgress ? 'disabled' : ''}
                >
                    ${deleteIcon}
                </button>
            </div>
        `).join('');
    }

    private readonly handleLayersPopoverClick = async (event: MouseEvent): Promise<void> => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const tabButton = target.closest<HTMLButtonElement>('.layers-popover__tab');
        if (tabButton) {
            this.layersPopoverTab = tabButton.id === 'layers-tab-overlays' ? 'overlays' : 'base';
            this.syncLayersPopoverTab();
            return;
        }

        const optionButton = target.closest<HTMLButtonElement>('.layers-popover__option');
        if (!optionButton || !this.mapController) {
            return;
        }

        const sourceId = optionButton.dataset.sourceId;
        const sourceKind = optionButton.dataset.sourceKind;
        if (!sourceId) {
            return;
        }

        if (sourceKind === 'overlay') {
            await this.mapController.toggleOverlaySource(sourceId);
            return;
        }

        await this.mapController.setRasterSource(sourceId);
        this.layersMenuOpen = false;
        this.syncLayersMenuVisibility();
    };

    private readonly handleSettingsPopoverClick = async (event: MouseEvent): Promise<void> => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        if (this.suppressSettingsClick) {
            this.suppressSettingsClick = false;
            return;
        }

        const tabButton = target.closest<HTMLButtonElement>('.settings-popover__tab');
        if (tabButton) {
            const nextTab = tabButton.dataset.panel;
            if (nextTab === 'general' || nextTab === 'layers' || nextTab === 'routes' || nextTab === 'downloads') {
                this.settingsPopoverTab = nextTab;
                this.syncSettingsPopoverTab();
            }
            return;
        }

        const deleteButton = target.closest<HTMLButtonElement>('.settings-popover__delete-button');
        if (deleteButton) {
            const downloadId = deleteButton.dataset.deleteDownloadId;
            if (downloadId) {
                await this.handleDeleteOfflineDownload(downloadId);
                return;
            }

            const sourceId = deleteButton.dataset.deleteSourceId;
            if (sourceId) {
                await this.animateAndDeleteLayer(sourceId, deleteButton);
            }
            return;
        }

        const deleteAllDownloadsButton = target.closest<HTMLButtonElement>('#settings-delete-all-downloads-button');
        if (deleteAllDownloadsButton) {
            await this.handleDeleteAllOfflineDownloads();
            return;
        }

        const themeToggle = target.closest<HTMLButtonElement>('#settings-theme-toggle');
        if (themeToggle) {
            this.toggleThemePreference();
            return;
        }

        const offlineModeToggle = target.closest<HTMLButtonElement>('#settings-offline-mode-toggle');
        if (offlineModeToggle) {
            await this.toggleOfflineModePreference();
            return;
        }

        const tintOfflineTilesToggle = target.closest<HTMLButtonElement>('#settings-tint-offline-tiles-toggle');
        if (tintOfflineTilesToggle) {
            await this.toggleTintOfflineTilesPreference();
            return;
        }

        const optionButton = target.closest<HTMLButtonElement>('.settings-popover__option');
        if (!optionButton) {
            return;
        }

        const sourceId = optionButton.dataset.settingsSourceId;
        const sourceKind = optionButton.dataset.settingsSourceKind;
        if (!sourceId || (sourceKind !== 'base' && sourceKind !== 'overlay')) {
            return;
        }

        await this.toggleLayerAvailability(sourceId, sourceKind);
    };

    private async toggleLayerAvailability(
        sourceId: string,
        sourceKind: 'base' | 'overlay'
    ): Promise<void> {
        const nextSettings = sourceKind === 'base'
            ? this.buildNextBaseLayerSettings(sourceId)
            : this.buildNextOverlaySettings(sourceId);

        if (!nextSettings) {
            return;
        }

        this.settings = nextSettings;
        saveSettings(nextSettings);

        // If the user hides the active base layer, switch immediately to the
        // next available one so the map and the layer picker cannot diverge.
        if (
            sourceKind === 'base' &&
            !nextSettings.enabledBaseLayerIds.includes(this.activeRasterSourceId)
        ) {
            const fallbackSourceId = nextSettings.enabledBaseLayerIds[0];
            if (fallbackSourceId) {
                this.activeRasterSourceId = fallbackSourceId;
                await this.mapController?.setRasterSource(fallbackSourceId);
            }
        }

        if (sourceKind === 'overlay') {
            const enabledOverlayIds = this.activeOverlayIds.filter((overlayId) =>
                nextSettings.enabledOverlayIds.includes(overlayId)
            );
            await this.mapController?.setOverlaySources(enabledOverlayIds);
        }

        this.refreshLayerSelectionMenu();
        this.refreshSettingsLayersPanel();
    }

    private buildNextBaseLayerSettings(sourceId: string): AppSettings | null {
        const enabledBaseLayerIds = this.settings.enabledBaseLayerIds.includes(sourceId)
            ? this.settings.enabledBaseLayerIds.filter((id) => id !== sourceId)
            : [...this.settings.enabledBaseLayerIds, sourceId];

        if (enabledBaseLayerIds.length === 0) {
            return null;
        }

        return {
            ...this.settings,
            enabledBaseLayerIds
        };
    }

    private buildNextOverlaySettings(sourceId: string): AppSettings {
        const enabledOverlayIds = this.settings.enabledOverlayIds.includes(sourceId)
            ? this.settings.enabledOverlayIds.filter((id) => id !== sourceId)
            : [...this.settings.enabledOverlayIds, sourceId];

        return {
            ...this.settings,
            enabledOverlayIds
        };
    }

    private refreshLayerSelectionMenu(): void {
        const baseList = this.container.querySelector<HTMLElement>('#layers-popover-base-list');
        const overlayList = this.container.querySelector<HTMLElement>('#layers-popover-overlay-list');

        if (baseList) {
            baseList.innerHTML = this.renderSourceOptions(this.getEnabledBaseSources(), 'base');
        }

        if (overlayList) {
            overlayList.innerHTML = this.renderSourceOptions(this.getEnabledOverlaySources(), 'overlay');
        }

        this.syncLayersMenuSelection();
    }

    private refreshSettingsLayersPanel(): void {
        const baseList = this.container.querySelector<HTMLElement>('#settings-base-layer-list');
        const overlayList = this.container.querySelector<HTMLElement>('#settings-overlay-layer-list');

        if (baseList) {
            baseList.innerHTML = this.renderSettingsSourceAvailabilityOptions(getBaseRasterSources(), 'base');
        }

        if (overlayList) {
            overlayList.innerHTML = this.renderSettingsSourceAvailabilityOptions(getOverlayRasterSources(), 'overlay');
        }
    }

    private refreshDownloadsPanel(): void {
        const downloadList = this.container.querySelector<HTMLElement>('#settings-download-list');
        const deleteAllButton = this.container.querySelector<HTMLButtonElement>('#settings-delete-all-downloads-button');

        if (downloadList) {
            downloadList.innerHTML = this.renderOfflineDownloadRows();
        }

        if (deleteAllButton) {
            deleteAllButton.disabled = this.offlineDownloads.length === 0 || this.offlineDownloadInProgress;
        }
    }

    private toggleThemePreference(): void {
        const nextTheme: AppTheme = this.settings.theme === 'light' ? 'dark' : 'light';
        const nextSettings: AppSettings = {
            ...this.settings,
            theme: nextTheme
        };

        this.settings = nextSettings;
        saveSettings(nextSettings);
        this.applyThemePreference(nextTheme);
        this.syncSettingsToggleControls();
    }

    private applyThemePreference(theme: AppTheme): void {
        // Apply the theme at both the root element and body so the palette
        // propagates cleanly through the whole document tree.
        if (theme === 'light') {
            document.documentElement.dataset.theme = 'light';
            document.body.dataset.theme = 'light';
            return;
        }

        delete document.documentElement.dataset.theme;
        delete document.body.dataset.theme;
    }

    private syncSettingsToggleControls(): void {
        const themeToggle = this.container.querySelector<HTMLButtonElement>('#settings-theme-toggle');
        if (themeToggle) {
            const isLightTheme = this.settings.theme === 'light';
            themeToggle.classList.toggle('is-active', isLightTheme);
            themeToggle.setAttribute('aria-checked', isLightTheme ? 'true' : 'false');
            themeToggle.setAttribute('title', isLightTheme ? 'Switch to dark mode' : 'Switch to light mode');
        }

        const offlineModeToggle = this.container.querySelector<HTMLButtonElement>('#settings-offline-mode-toggle');
        if (offlineModeToggle) {
            offlineModeToggle.classList.toggle('is-active', this.settings.offlineMode);
            offlineModeToggle.setAttribute('aria-checked', this.settings.offlineMode ? 'true' : 'false');
            offlineModeToggle.setAttribute('title', this.settings.offlineMode ? 'Disable offline mode' : 'Enable offline mode');
        }

        const tintOfflineTilesToggle = this.container.querySelector<HTMLButtonElement>('#settings-tint-offline-tiles-toggle');
        if (tintOfflineTilesToggle) {
            tintOfflineTilesToggle.classList.toggle('is-active', this.settings.tintOfflineTiles);
            tintOfflineTilesToggle.setAttribute('aria-checked', this.settings.tintOfflineTiles ? 'true' : 'false');
            tintOfflineTilesToggle.setAttribute('title', this.settings.tintOfflineTiles ? 'Disable offline tile tint' : 'Enable offline tile tint');
        }
    }

    private async initializeOfflineState(): Promise<void> {
        try {
            await syncOfflineSourceCatalog(getAllRasterSources());
            await syncOfflineServiceWorkerConfig(
                this.settings.offlineMode,
                this.settings.tintOfflineTiles
            );
            await this.refreshOfflineDownloads();
        } catch (error) {
            console.error('Unable to initialize offline tile cache metadata.', error);
        }
    }

    private async refreshOfflineDownloads(): Promise<void> {
        try {
            this.offlineDownloads = await listOfflineDownloads();
            this.refreshDownloadsPanel();
        } catch (error) {
            console.error('Unable to load offline downloads.', error);
        }
    }

    private async handleViewportDownloadRequest(downloadButton: HTMLButtonElement): Promise<void> {
        if (!this.mapController || this.offlineDownloadInProgress) {
            return;
        }

        const name = window.prompt('Name this offline area.', this.buildDefaultDownloadName());
        if (name === null) {
            return;
        }

        const trimmedName = name.trim();
        if (!trimmedName) {
            window.alert('Please provide a non-empty download name.');
            return;
        }

        const maxZoomInput = window.prompt(
            'Maximum zoom level to download.',
            String(getDefaultDownloadMaxZoom())
        );
        if (maxZoomInput === null) {
            return;
        }

        const parsedMaxZoom = Number.parseInt(maxZoomInput, 10);
        if (Number.isNaN(parsedMaxZoom) || parsedMaxZoom < 0) {
            window.alert('Please provide a valid non-negative integer zoom level.');
            return;
        }

        const bounds = this.mapController.getViewportBounds();
        if (!bounds) {
            window.alert('The current map viewport is not available yet.');
            return;
        }

        const visibleSources = this.getVisibleRasterSources();
        if (visibleSources.length === 0) {
            window.alert('No visible raster layers are available to download.');
            return;
        }

        const currentZoomFloor = Math.floor(this.mapController.getCurrentZoom());
        const plan = createViewportDownloadPlan(bounds, currentZoomFloor, parsedMaxZoom, visibleSources);
        if (plan.tasks.length === 0) {
            window.alert('No tiles were found for the current viewport and zoom range.');
            return;
        }

        if (
            plan.tasks.length >= getDownloadTileWarningCount() &&
            !window.confirm(`This download will fetch ${plan.tasks.length} tiles. Continue?`)
        ) {
            return;
        }

        this.offlineDownloadInProgress = true;
        downloadButton.disabled = true;
        downloadButton.classList.add('is-loading');
        this.refreshDownloadsPanel();

        try {
            await syncOfflineSourceCatalog(getAllRasterSources());
            const createdJob = await downloadViewportTiles({
                name: trimmedName,
                bounds,
                minZoom: currentZoomFloor,
                maxZoom: parsedMaxZoom,
                sources: visibleSources
            });

            await this.refreshOfflineDownloads();
            window.alert(`Downloaded ${createdJob.tileCount} tiles (${this.formatBytes(createdJob.sizeBytes)}).`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to download the current viewport.';
            window.alert(message);
        } finally {
            this.offlineDownloadInProgress = false;
            downloadButton.disabled = false;
            downloadButton.classList.remove('is-loading');
            this.refreshDownloadsPanel();
        }
    }

    private async toggleOfflineModePreference(): Promise<void> {
        const nextSettings: AppSettings = {
            ...this.settings,
            offlineMode: !this.settings.offlineMode
        };

        this.settings = nextSettings;
        saveSettings(nextSettings);
        this.syncSettingsToggleControls();
        await syncOfflineServiceWorkerConfig(
            nextSettings.offlineMode,
            nextSettings.tintOfflineTiles
        );
    }

    private async toggleTintOfflineTilesPreference(): Promise<void> {
        const nextSettings: AppSettings = {
            ...this.settings,
            tintOfflineTiles: !this.settings.tintOfflineTiles
        };

        this.settings = nextSettings;
        saveSettings(nextSettings);
        this.syncSettingsToggleControls();
        await syncOfflineServiceWorkerConfig(
            nextSettings.offlineMode,
            nextSettings.tintOfflineTiles
        );
    }

    private async handleDeleteOfflineDownload(downloadId: string): Promise<void> {
        if (this.offlineDownloadInProgress) {
            return;
        }

        const download = this.offlineDownloads.find((entry) => entry.id === downloadId);
        if (!download || !window.confirm(`Delete offline area "${download.name}"?`)) {
            return;
        }

        this.offlineDownloadInProgress = true;
        this.refreshDownloadsPanel();

        try {
            await deleteOfflineDownload(downloadId);
            await this.refreshOfflineDownloads();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to delete the offline area.';
            window.alert(message);
        } finally {
            this.offlineDownloadInProgress = false;
            this.refreshDownloadsPanel();
        }
    }

    private async handleDeleteAllOfflineDownloads(): Promise<void> {
        if (this.offlineDownloadInProgress || this.offlineDownloads.length === 0) {
            return;
        }

        if (!window.confirm('Delete all offline areas?')) {
            return;
        }

        this.offlineDownloadInProgress = true;
        this.refreshDownloadsPanel();

        try {
            await deleteAllOfflineDownloads();
            await this.refreshOfflineDownloads();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to delete offline areas.';
            window.alert(message);
        } finally {
            this.offlineDownloadInProgress = false;
            this.refreshDownloadsPanel();
        }
    }

    private getVisibleRasterSources(): RasterSourceConfig[] {
        const visibleSources: RasterSourceConfig[] = [];
        const activeBaseSource = findRasterSourceById(this.activeRasterSourceId);
        if (activeBaseSource) {
            visibleSources.push(activeBaseSource);
        }

        this.activeOverlayIds.forEach((overlayId) => {
            const overlaySource = findRasterSourceById(overlayId);
            if (overlaySource) {
                visibleSources.push(overlaySource);
            }
        });

        return visibleSources;
    }

    private buildDefaultDownloadName(): string {
        const now = new Date();
        const dateLabel = now.toISOString().slice(0, 10);
        return `Offline area ${dateLabel}`;
    }

    private formatDownloadMeta(download: OfflineDownloadJob): string {
        return `${this.formatBytes(download.sizeBytes)} • ${download.tileCount} tiles`;
    }

    private formatBytes(sizeBytes: number): string {
        if (sizeBytes < 1024) {
            return `${sizeBytes} B`;
        }
        if (sizeBytes < 1024 * 1024) {
            return `${(sizeBytes / 1024).toFixed(1)} KB`;
        }

        return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    private getEnabledBaseSources(): RasterSourceConfig[] {
        const enabledIds = new Set(this.settings.enabledBaseLayerIds);
        return getBaseRasterSources().filter((source) => enabledIds.has(source.id));
    }

    private getEnabledOverlaySources(): RasterSourceConfig[] {
        const enabledIds = new Set(this.settings.enabledOverlayIds);
        return getOverlayRasterSources().filter((source) => enabledIds.has(source.id));
    }

    private persistLayerSelection(): void {
        this.layerSelection = {
            activeBaseLayerId: this.activeRasterSourceId,
            activeOverlayIds: [...this.activeOverlayIds]
        };
        saveLayerSelection(this.layerSelection);
    }

    private async importLayersFromFile(file: File): Promise<void> {
        const importedJson = JSON.parse(await file.text());
        const importedSources = parseRasterSourceImport(importedJson, getAllRasterSources());

        // The source catalog is module state so the UI, settings, and map
        // controller all read the same merged view of built-in and custom layers.
        appendCustomRasterSources(importedSources);
        const nextSourceCatalogState = getSourceCatalogState();
        saveSourceCatalog(nextSourceCatalogState);

        const nextSettings = {
            theme: this.settings.theme,
            offlineMode: this.settings.offlineMode,
            tintOfflineTiles: this.settings.tintOfflineTiles,
            enabledBaseLayerIds: this.mergeEnabledLayerIds(
                this.settings.enabledBaseLayerIds,
                importedSources.filter((source) => source.type === 'base').map((source) => source.id)
            ),
            enabledOverlayIds: this.mergeEnabledLayerIds(
                this.settings.enabledOverlayIds,
                importedSources.filter((source) => source.type === 'overlay').map((source) => source.id)
            )
        };

        this.settings = nextSettings;
        saveSettings(nextSettings);
        this.refreshLayerSelectionMenu();
        this.refreshSettingsLayersPanel();
        await syncOfflineSourceCatalog(getAllRasterSources());

        window.alert(`Imported ${importedSources.length} layer${importedSources.length === 1 ? '' : 's'}.`);
    }

    private mergeEnabledLayerIds(
        existingIds: readonly string[],
        importedIds: readonly string[]
    ): string[] {
        const mergedIds = new Set(existingIds);
        importedIds.forEach((sourceId) => {
            mergedIds.add(sourceId);
        });
        return [...mergedIds];
    }

    private handleSettingsPointerDown(event: PointerEvent): void {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        if (this.settingsDragState || this.settingsSwipeState) {
            return;
        }

        const handle = target.closest<HTMLButtonElement>('.settings-popover__handle');
        if (!handle) {
            this.beginSettingsSwipeCandidate(event, target);
            return;
        }

        const item = handle.closest<HTMLElement>('.settings-popover__item');
        const list = handle.closest<HTMLElement>('.settings-popover__list');
        if (!item || !list) {
            return;
        }

        const sourceId = item.dataset.settingsSourceId;
        const sourceKind = item.dataset.settingsSourceKind;
        if (!sourceId || (sourceKind !== 'base' && sourceKind !== 'overlay')) {
            return;
        }

        event.preventDefault();

        this.settingsDragState = {
            pointerId: event.pointerId,
            sourceId,
            sourceKind,
            list,
            item,
            startPointerY: event.clientY,
            scrollOrigin: list.scrollTop,
            baseShiftY: 0
        };

        handle.setPointerCapture(event.pointerId);
        item.classList.add('is-dragging');
        list.classList.add('is-sorting');
        document.body.classList.add('is-sorting-layers');
        this.updateDraggedItemOffset(event.clientY);

        window.addEventListener('pointermove', this.handleSettingsPointerMove);
        window.addEventListener('pointerup', this.handleSettingsPointerUp);
        window.addEventListener('pointercancel', this.handleSettingsPointerUp);
    }

    private beginSettingsSwipeCandidate(event: PointerEvent, target: Element): void {
        const item = target.closest<HTMLElement>('.settings-popover__item.is-custom');
        if (!item) {
            return;
        }

        const itemRect = item.getBoundingClientRect();
        const rightEdgeThreshold = 64;
        const isDeleteButton = Boolean(target.closest('.settings-popover__delete-button'));
        const isNearRightEdge = itemRect.right - event.clientX <= rightEdgeThreshold;

        if (!isDeleteButton && !isNearRightEdge) {
            return;
        }

        const sourceId = item.dataset.settingsSourceId;
        if (!sourceId) {
            return;
        }

        this.settingsSwipeState = {
            pointerId: event.pointerId,
            sourceId,
            item,
            startPointerX: event.clientX,
            startPointerY: event.clientY,
            engaged: false,
            offsetX: 0
        };

        window.addEventListener('pointermove', this.handleSettingsSwipeMove);
        window.addEventListener('pointerup', this.handleSettingsSwipeEnd);
        window.addEventListener('pointercancel', this.handleSettingsSwipeEnd);
    }

    private readonly handleSettingsPointerMove = (event: PointerEvent): void => {
        const dragState = this.settingsDragState;
        if (!dragState || event.pointerId !== dragState.pointerId) {
            return;
        }

        event.preventDefault();
        this.updateDraggedItemOffset(event.clientY);
        this.autoScrollSettingsList(event.clientY);
        this.repositionDraggedItem(event.clientY);
    };

    private readonly handleSettingsPointerUp = (event: PointerEvent): void => {
        const dragState = this.settingsDragState;
        if (!dragState || event.pointerId !== dragState.pointerId) {
            return;
        }

        this.persistDraggedItemOrder();
        this.clearDraggedItemState();
    };

    private readonly handleSettingsSwipeMove = (event: PointerEvent): void => {
        const swipeState = this.settingsSwipeState;
        if (!swipeState || event.pointerId !== swipeState.pointerId) {
            return;
        }

        const deltaX = event.clientX - swipeState.startPointerX;
        const deltaY = event.clientY - swipeState.startPointerY;

        if (!swipeState.engaged) {
            if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
                this.clearSwipeState();
                return;
            }

            if (deltaX < -8 && Math.abs(deltaX) > Math.abs(deltaY)) {
                swipeState.engaged = true;
                swipeState.item.classList.add('is-swiping');
            } else {
                return;
            }
        }

        event.preventDefault();

        const clampedOffsetX = Math.max(-96, Math.min(0, deltaX));
        swipeState.offsetX = clampedOffsetX;
        swipeState.item.style.setProperty('--swipe-offset-x', `${clampedOffsetX}px`);
    };

    private readonly handleSettingsSwipeEnd = async (event: PointerEvent): Promise<void> => {
        const swipeState = this.settingsSwipeState;
        if (!swipeState || event.pointerId !== swipeState.pointerId) {
            return;
        }

        const shouldDelete = swipeState.engaged && swipeState.offsetX <= -56;
        const sourceId = swipeState.sourceId;
        const item = swipeState.item;
        const offsetX = swipeState.offsetX;

        this.suppressSettingsClick = swipeState.engaged;
        this.clearSwipeState();

        if (shouldDelete) {
            await this.animateAndDeleteLayer(sourceId, item, offsetX);
        }
    };

    private updateDraggedItemOffset(pointerY: number): void {
        const dragState = this.settingsDragState;
        if (!dragState) {
            return;
        }

        const offsetY = pointerY
            - dragState.startPointerY
            + (dragState.list.scrollTop - dragState.scrollOrigin)
            - dragState.baseShiftY;
        dragState.item.style.setProperty('--sort-offset-y', `${offsetY}px`);
    }

    private repositionDraggedItem(pointerY: number): void {
        const dragState = this.settingsDragState;
        if (!dragState) {
            return;
        }

        const siblingItems = Array.from(
            dragState.list.querySelectorAll<HTMLElement>('.settings-popover__item:not(.is-dragging)')
        ).filter((item) => item.dataset.settingsSourceKind === dragState.sourceKind);

        const previousOffsetTop = dragState.item.offsetTop;
        const insertionTarget = siblingItems.find((item) => {
            const rect = item.getBoundingClientRect();
            return pointerY < rect.top + (rect.height / 2);
        });

        if (insertionTarget) {
            dragState.list.insertBefore(dragState.item, insertionTarget);
            dragState.baseShiftY += dragState.item.offsetTop - previousOffsetTop;
            return;
        }

        dragState.list.appendChild(dragState.item);
        dragState.baseShiftY += dragState.item.offsetTop - previousOffsetTop;
    }

    private autoScrollSettingsList(pointerY: number): void {
        const dragState = this.settingsDragState;
        if (!dragState) {
            return;
        }

        const listRect = dragState.list.getBoundingClientRect();
        const edgeInset = 52;
        const maxStep = 14;
        let scrollDelta = 0;

        if (pointerY < listRect.top + edgeInset) {
            const ratio = Math.max(0, (listRect.top + edgeInset - pointerY) / edgeInset);
            scrollDelta = -Math.ceil(maxStep * ratio);
        } else if (pointerY > listRect.bottom - edgeInset) {
            const ratio = Math.max(0, (pointerY - (listRect.bottom - edgeInset)) / edgeInset);
            scrollDelta = Math.ceil(maxStep * ratio);
        }

        if (scrollDelta !== 0) {
            dragState.list.scrollTop += scrollDelta;
        }
    }

    private persistDraggedItemOrder(): void {
        const dragState = this.settingsDragState;
        if (!dragState) {
            return;
        }

        const orderedSourceIds = Array.from(
            dragState.list.querySelectorAll<HTMLElement>('.settings-popover__item')
        )
            .filter((item) => item.dataset.settingsSourceKind === dragState.sourceKind)
            .map((item) => item.dataset.settingsSourceId)
            .filter((sourceId): sourceId is string => typeof sourceId === 'string');

        setRasterSourceOrder(dragState.sourceKind, orderedSourceIds);
        saveSourceCatalog(getSourceCatalogState());
        this.refreshLayerSelectionMenu();
        this.refreshSettingsLayersPanel();
        void syncOfflineSourceCatalog(getAllRasterSources());
    }

    private clearDraggedItemState(): void {
        window.removeEventListener('pointermove', this.handleSettingsPointerMove);
        window.removeEventListener('pointerup', this.handleSettingsPointerUp);
        window.removeEventListener('pointercancel', this.handleSettingsPointerUp);

        const dragState = this.settingsDragState;
        if (dragState) {
            dragState.item.classList.remove('is-dragging');
            dragState.item.style.removeProperty('--sort-offset-y');
            dragState.list.classList.remove('is-sorting');
        }

        document.body.classList.remove('is-sorting-layers');
        this.settingsDragState = null;
    }

    private clearSwipeState(): void {
        window.removeEventListener('pointermove', this.handleSettingsSwipeMove);
        window.removeEventListener('pointerup', this.handleSettingsSwipeEnd);
        window.removeEventListener('pointercancel', this.handleSettingsSwipeEnd);

        const swipeState = this.settingsSwipeState;
        if (swipeState) {
            swipeState.item.classList.remove('is-swiping');
            swipeState.item.style.removeProperty('--swipe-offset-x');
        }

        this.settingsSwipeState = null;
    }

    private async animateAndDeleteLayer(
        sourceId: string,
        deleteOrigin: HTMLElement,
        initialOffsetX: number = 0
    ): Promise<void> {
        const item = deleteOrigin.closest<HTMLElement>('.settings-popover__item') ?? deleteOrigin;
        if (item) {
            item.classList.add('is-deleting');
            const animation = item.animate([
                { opacity: 1, transform: `translateX(${initialOffsetX}px) scale(1)` },
                { opacity: 0, transform: 'translateX(-132px) scale(0.97)' }
            ], {
                duration: 220,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'forwards'
            });

            try {
                await animation.finished;
            } catch {
                // Ignore aborted animations and continue with the delete.
            }
        }

        await this.deleteLayer(sourceId);
    }

    private async deleteLayer(sourceId: string): Promise<void> {
        const removedSource = deleteCustomRasterSource(sourceId);
        if (!removedSource) {
            return;
        }

        saveSourceCatalog(getSourceCatalogState());
        await syncOfflineSourceCatalog(getAllRasterSources());

        const nextSettings = this.buildSettingsWithoutSource(sourceId, removedSource.type);
        this.settings = nextSettings;
        saveSettings(nextSettings);

        if (removedSource.type === 'base') {
            await this.ensureValidActiveBaseLayer(sourceId, nextSettings.enabledBaseLayerIds);
        } else {
            const nextOverlayIds = this.activeOverlayIds.filter((overlayId) => overlayId !== sourceId);
            await this.mapController?.setOverlaySources(nextOverlayIds);
        }

        this.refreshLayerSelectionMenu();
        this.refreshSettingsLayersPanel();
    }

    private buildSettingsWithoutSource(
        sourceId: string,
        sourceKind: 'base' | 'overlay'
    ): AppSettings {
        if (sourceKind === 'overlay') {
            return {
                ...this.settings,
                enabledOverlayIds: this.settings.enabledOverlayIds.filter((id) => id !== sourceId)
            };
        }

        let enabledBaseLayerIds = this.settings.enabledBaseLayerIds.filter((id) => id !== sourceId);
        if (enabledBaseLayerIds.length === 0) {
            const fallbackId = getBaseRasterSources()[0]?.id;
            if (fallbackId) {
                enabledBaseLayerIds = [fallbackId];
            }
        }

        return {
            ...this.settings,
            enabledBaseLayerIds
        };
    }

    private async ensureValidActiveBaseLayer(
        removedSourceId: string,
        enabledBaseLayerIds: readonly string[]
    ): Promise<void> {
        if (this.activeRasterSourceId !== removedSourceId) {
            return;
        }

        const fallbackId = enabledBaseLayerIds[0] ?? getBaseRasterSources()[0]?.id;
        if (fallbackId) {
            this.activeRasterSourceId = fallbackId;
            await this.mapController?.setRasterSource(fallbackId);
        }
    }

    private readonly handleDocumentClick = (event: MouseEvent): void => {
        if (!this.layersMenuOpen && !this.settingsMenuOpen) {
            return;
        }

        const target = event.target;
        if (!(target instanceof Node)) {
            return;
        }

        const popover = this.container.querySelector<HTMLElement>('#map-layers-popover');
        const settingsPopover = this.container.querySelector<HTMLElement>('#map-settings-popover');
        const trigger = this.container.querySelector<HTMLButtonElement>('#map-layers-button');
        const settingsTrigger = this.container.querySelector<HTMLButtonElement>('#map-settings-button');

        if (
            popover?.contains(target) ||
            trigger?.contains(target) ||
            settingsPopover?.contains(target) ||
            settingsTrigger?.contains(target)
        ) {
            return;
        }

        this.layersMenuOpen = false;
        this.syncLayersMenuVisibility();
        this.settingsMenuOpen = false;
        this.syncSettingsMenuVisibility();
    };
}
