const OFFLINE_TILE_CACHE_ROOT = "tile-cache";
const MANIFEST_FILENAME = "cache.json";
const TILES_DIRECTORY = "tiles";
const OWNERSHIP_DIRECTORY = "ownership";
const PLACEHOLDER_PATTERN = /\{(z|x|y)\}/g;

let manifestCache = null;

self.addEventListener("message", (event) => {
  if (event.data?.type === "offline-tile-cache-updated") {
    manifestCache = null;
  }
});

export async function createOfflineTileResponse(request, options = {}) {
  const manifest = await readManifest();
  if (
    !manifest ||
    !Array.isArray(manifest.sources) ||
    manifest.sources.length === 0
  ) {
    return null;
  }

  for (const source of manifest.sources) {
    const coordinates = matchRequestUrlToSource(request.url, source);
    if (!coordinates) {
      continue;
    }

    const ownershipEntry = await readOwnershipEntry(
      source.id,
      coordinates.z,
      coordinates.x,
      coordinates.y,
    );
    if (!ownershipEntry) {
      continue;
    }

    const tileBlob = await readTileBlob(
      source.id,
      coordinates.z,
      coordinates.x,
      coordinates.y,
      ownershipEntry.extension,
    );

    if (!tileBlob) {
      continue;
    }

    const responseBlob = options.tintOfflineTiles
      ? await tintTileBlob(tileBlob, ownershipEntry.contentType)
      : tileBlob;

    return new Response(responseBlob, {
      status: 200,
      headers: {
        "Content-Type": ownershipEntry.contentType,
        "X-MultiMap-Offline": "1",
      },
    });
  }
  return null;
}

async function readManifest() {
  if (manifestCache) {
    return manifestCache;
  }

  try {
    const root = await getCacheRootDirectory();
    const fileHandle = await root.getFileHandle(MANIFEST_FILENAME);
    const file = await fileHandle.getFile();
    if (file.size === 0) {
      return null;
    }

    manifestCache = JSON.parse(await file.text());
    return manifestCache;
  } catch {
    return null;
  }
}

async function readOwnershipEntry(sourceId, z, x, y) {
  try {
    const root = await getCacheRootDirectory();
    const ownershipRoot = await root.getDirectoryHandle(OWNERSHIP_DIRECTORY);
    const sourceDirectory = await ownershipRoot.getDirectoryHandle(sourceId);
    const zoomDirectory = await sourceDirectory.getDirectoryHandle(String(z));
    const shardHandle = await zoomDirectory.getFileHandle(`${x}.json`);
    const shardFile = await shardHandle.getFile();
    const shard = JSON.parse(await shardFile.text());
    const entry = shard?.[String(y)];

    if (!entry || !Array.isArray(entry.owners) || entry.owners.length === 0) {
      return null;
    }

    return entry;
  } catch {
    return null;
  }
}

async function readTileBlob(sourceId, z, x, y, extension) {
  try {
    const root = await getCacheRootDirectory();
    const tilesRoot = await root.getDirectoryHandle(TILES_DIRECTORY);
    const sourceDirectory = await tilesRoot.getDirectoryHandle(sourceId);
    const zoomDirectory = await sourceDirectory.getDirectoryHandle(String(z));
    const xDirectory = await zoomDirectory.getDirectoryHandle(String(x));
    const fileHandle = await xDirectory.getFileHandle(`${y}.${extension}`);
    const file = await fileHandle.getFile();
    return file;
  } catch {
    return null;
  }
}

async function getCacheRootDirectory() {
  const rootDirectory = await navigator.storage.getDirectory();
  return rootDirectory.getDirectoryHandle(OFFLINE_TILE_CACHE_ROOT, {
    create: true,
  });
}

function matchRequestUrlToSource(requestUrl, source) {
  for (const template of source.tiles ?? []) {
    const coordinates = matchRequestUrlToTemplate(requestUrl, template);
    if (coordinates) {
      return coordinates;
    }
  }
  return null;
}

function matchRequestUrlToTemplate(requestUrl, template) {
  const normalizedRequestUrl = normalizeUrlForTemplateMatch(
    requestUrl,
    template,
  );
  const normalizedTemplate = normalizeTemplateForMatch(template);
  const tokenizedTemplate = normalizedTemplate.replace(
    PLACEHOLDER_PATTERN,
    (_, placeholder) => `__MULTIMAP_${placeholder.toUpperCase()}__`,
  );
  const pattern = `^${escapeRegExp(tokenizedTemplate)
    .replace("__MULTIMAP_Z__", "(?<z>\\d+)")
    .replace("__MULTIMAP_X__", "(?<x>\\d+)")
    .replace("__MULTIMAP_Y__", "(?<y>\\d+)")}$`;
  const match = new RegExp(pattern).exec(normalizedRequestUrl);

  if (!match?.groups) {
    return null;
  }

  const z = Number.parseInt(match.groups.z ?? "", 10);
  const x = Number.parseInt(match.groups.x ?? "", 10);
  const y = Number.parseInt(match.groups.y ?? "", 10);

  if ([z, x, y].some((value) => Number.isNaN(value))) {
    return null;
  }

  return { z, x, y };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeUrlForTemplateMatch(requestUrl, template) {
  const request = new URL(requestUrl);

  if (template.includes("?")) {
    return request.origin + request.pathname + request.search;
  }

  return request.origin + request.pathname;
}

function normalizeTemplateForMatch(template) {
  if (template.includes("?")) {
    return template;
  }

  return template;
}

async function tintTileBlob(tileBlob, contentType) {
  if (
    typeof OffscreenCanvas === "undefined" ||
    typeof createImageBitmap !== "function"
  ) {
    return tileBlob;
  }

  try {
    const imageBitmap = await createImageBitmap(tileBlob);
    const canvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const context = canvas.getContext("2d");

    if (!context) {
      imageBitmap.close();
      return tileBlob;
    }

    context.drawImage(imageBitmap, 0, 0);
    context.fillStyle = "rgba(36, 180, 76, 0.28)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    imageBitmap.close();

    return await canvas.convertToBlob({
      type: normalizeTintContentType(contentType),
    });
  } catch {
    return tileBlob;
  }
}

function normalizeTintContentType(contentType) {
  if (contentType.includes("png")) {
    return "image/png";
  }
  if (contentType.includes("webp")) {
    return "image/webp";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return "image/jpeg";
  }

  return "image/png";
}
