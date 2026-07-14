export interface RasterSourceConfig {
  readonly id: string;
  readonly layerId: string;
  readonly tiles: readonly string[];
  readonly tileSize: number;
  readonly zlims: readonly [number, number];
  readonly bounds: [number, number, number, number] | null;
  readonly attribution: string;
  readonly example_zxy: readonly [number, number, number];
}

export const SOURCE_OPEN_TOPO_MAP: RasterSourceConfig = {
  id: 'open-topo-map',
  layerId: 'OpenTopoMap',
  tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  zlims: [0, 17],
  bounds: null,
  attribution: '© OpenStreetMap contributors',
  example_zxy: [12, 2132, 1457],
};

export const SOURCE_OPEN_STREET_MAP: RasterSourceConfig = {
  id: 'open-street-map',
  layerId: 'OpenStreetMap',
  tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  tileSize: 256,
  zlims: [0, 21],
  bounds: null,
  attribution: '© OpenStreetMap contributors',
  example_zxy: [13, 4054, 2685],
};

export const SOURCE_SWISSTOPO_BASE: RasterSourceConfig = {
  id: 'swisstopo-base',
  layerId: 'SwissTopoBase',
  tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg'],
  tileSize: 256,
  zlims: [0, 19],
  bounds: [5.140242, 45.398181, 11.47757, 48.230651],
  attribution: '© swisstopo',
  example_zxy: [13, 4271, 2911],
};

export const SOURCE_ESRI_SATELLITE: RasterSourceConfig = {
  id: 'esri-satellite',
  layerId: 'EsriSatellite',
  tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  zlims: [0, 19],
  bounds: null,
  attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  example_zxy: [13, 4149, 2818],
};

export let SOURCES_RASTER = [
  SOURCE_OPEN_TOPO_MAP,
  SOURCE_OPEN_STREET_MAP,
  SOURCE_SWISSTOPO_BASE,
  SOURCE_ESRI_SATELLITE
];


export const SOURCE_ESRI_PLACES: RasterSourceConfig = {
  id: 'esri-places',
  layerId: 'EsriPlaces',
  tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  zlims: [0, 19],
  bounds: null,
  attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  example_zxy: [13, 4149, 2818],
};

export const SOURCE_ESRI_TRANSPORTATION: RasterSourceConfig = {
  id: 'esri-transportation',
  layerId: 'EsriTransportation',
  tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  zlims: [0, 19],
  bounds: null,
  attribution: '© Esri, Maxar, Earthstar Geographics, and the GIS User Community',
  example_zxy: [13, 4149, 2818],
};

export const SOURCE_CARTO_LABELS: RasterSourceConfig = {
  id: 'carto_labels',
  layerId: 'CartoLabels',
  tiles: ['https://basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png'],
  tileSize: 256,
  zlims: [0, 20],
  bounds: null,
  attribution: '© OpenStreetMap contributors © CARTO',
  example_zxy: [13, 4149, 2818],
};

export let SOURCES_RASTER_OVERLAYS = [
  SOURCE_ESRI_PLACES,
  SOURCE_ESRI_TRANSPORTATION,
  SOURCE_CARTO_LABELS
];


// Keeping the source definition separate from the controller makes it easier
// to swap in additional base maps later without rewriting map lifecycle code.
export const DEFAULT_RASTER_SOURCE: RasterSourceConfig = SOURCE_OPEN_TOPO_MAP;
