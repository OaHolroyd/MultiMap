import { MapController } from '../map/MapController';
import {
    SOURCES_RASTER,
    SOURCES_RASTER_OVERLAYS,
    type RasterSourceConfig
} from '../map/sources';
import { loadLayerSelection, saveLayerSelection } from '../map/storage';
import type { LayerSelectionState } from '../map/layerSelection';
import { loadSettings, saveSettings } from '../settings/storage';
import {
    type AppSettings,
    type SettingsPopoverTab
} from '../settings/settings';
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
    private settingsMenuOpen: boolean;
    private activeRasterSourceId: string;
    private activeOverlayIds: string[];
    private layersPopoverTab: LayersPopoverTab;
    private settingsPopoverTab: SettingsPopoverTab;
    private settings: AppSettings;
    private layerSelection: LayerSelectionState;

    constructor(container: HTMLElement) {
        this.container = container;
        this.mapController = null;
        this.controlsExpanded = true;
        this.northResetVisible = false;
        this.layersMenuOpen = false;
        this.settingsMenuOpen = false;
        this.settings = loadSettings();
        this.layerSelection = loadLayerSelection(this.settings);
        this.activeRasterSourceId = this.layerSelection.activeBaseLayerId;
        this.activeOverlayIds = [...this.layerSelection.activeOverlayIds];
        this.layersPopoverTab = 'base';
        this.settingsPopoverTab = 'layers';
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
                    ${this.renderSettingsPopover()}
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
        const settingsButton = this.container.querySelector<HTMLButtonElement>('#map-settings-button');
        const layersPopover = this.container.querySelector<HTMLElement>('#map-layers-popover');
        const settingsPopover = this.container.querySelector<HTMLElement>('#map-settings-popover');

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

        settingsButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.layersMenuOpen = false;
            this.syncLayersMenuVisibility();
            this.settingsMenuOpen = !this.settingsMenuOpen;
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
                class="map-popover layers-popover ${this.layersMenuOpen ? 'is-open' : ''}"
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
                id="map-settings-popover"
                class="map-popover settings-popover ${this.settingsMenuOpen ? 'is-open' : ''}"
                aria-hidden="${this.settingsMenuOpen ? 'false' : 'true'}"
            >
                <div class="layers-popover__header">Settings</div>
                <div class="settings-popover__tabs" role="tablist" aria-label="Settings sections">
                    ${this.renderSettingsTabButton('general', settingsIcon, 'General settings')}
                    ${this.renderSettingsTabButton('layers', layersIcon, 'Layer settings')}
                    ${this.renderSettingsTabButton('routes', routesIcon, 'Route settings')}
                    ${this.renderSettingsTabButton('downloads', downloadIcon, 'Download settings')}
                </div>
                ${this.renderSettingsPopoverPanel('general', `
                    <div class="settings-popover__placeholder">
                        General settings will be added here.
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('layers', `
                    <div class="settings-popover__section">
                        <div class="settings-popover__section-label">Base layers</div>
                        <div id="settings-base-layer-list" class="settings-popover__list">
                            ${this.renderSettingsSourceAvailabilityOptions(SOURCES_RASTER, 'base')}
                        </div>
                    </div>
                    <div class="settings-popover__section">
                        <div class="settings-popover__section-label">Overlays</div>
                        <div id="settings-overlay-layer-list" class="settings-popover__list">
                            ${this.renderSettingsSourceAvailabilityOptions(SOURCES_RASTER_OVERLAYS, 'overlay')}
                        </div>
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('routes', `
                    <div class="settings-popover__placeholder">
                        Route settings will be added here.
                    </div>
                `)}
                ${this.renderSettingsPopoverPanel('downloads', `
                    <div class="settings-popover__placeholder">
                        Download settings will be added here.
                    </div>
                `)}
            </div>
        `;
    }

    private syncLayersMenuVisibility(): void {
        const popover = this.container.querySelector<HTMLElement>('#map-layers-popover');

        if (!popover) {
            return;
        }

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
        const popover = this.container.querySelector<HTMLElement>('#map-settings-popover');

        if (!popover) {
            return;
        }

        popover.classList.toggle('is-open', this.settingsMenuOpen);
        popover.setAttribute('aria-hidden', this.settingsMenuOpen ? 'false' : 'true');
        this.syncSettingsPopoverTab();
        this.refreshSettingsLayersPanel();
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

            return `
                <button
                    class="settings-popover__option ${isEnabled ? 'is-enabled' : 'is-disabled'}"
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
            `;
        }).join('');
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

        const tabButton = target.closest<HTMLButtonElement>('.settings-popover__tab');
        if (tabButton) {
            const nextTab = tabButton.dataset.panel;
            if (nextTab === 'general' || nextTab === 'layers' || nextTab === 'routes' || nextTab === 'downloads') {
                this.settingsPopoverTab = nextTab;
                this.syncSettingsPopoverTab();
            }
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
            baseList.innerHTML = this.renderSettingsSourceAvailabilityOptions(SOURCES_RASTER, 'base');
        }

        if (overlayList) {
            overlayList.innerHTML = this.renderSettingsSourceAvailabilityOptions(SOURCES_RASTER_OVERLAYS, 'overlay');
        }
    }

    private getEnabledBaseSources(): RasterSourceConfig[] {
        const enabledIds = new Set(this.settings.enabledBaseLayerIds);
        return SOURCES_RASTER.filter((source) => enabledIds.has(source.id));
    }

    private getEnabledOverlaySources(): RasterSourceConfig[] {
        const enabledIds = new Set(this.settings.enabledOverlayIds);
        return SOURCES_RASTER_OVERLAYS.filter((source) => enabledIds.has(source.id));
    }

    private persistLayerSelection(): void {
        this.layerSelection = {
            activeBaseLayerId: this.activeRasterSourceId,
            activeOverlayIds: [...this.activeOverlayIds]
        };
        saveLayerSelection(this.layerSelection);
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
