import './styles/app.css';
import { AppShell } from './app/AppShell';
import { syncOfflineServiceWorkerConfig } from './offline/serviceWorkerBridge';
import { loadSettings } from './settings/storage';

const appContainer = document.getElementById('app');

if (appContainer) {
    const app = new AppShell(appContainer);
    app.init();
}

if ('serviceWorker' in navigator && isServiceWorkerRuntimeSupported()) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js', { type: 'module' })
            .then(async (registration) => {
                console.log('SW registered successfully with scope: ', registration.scope);
                await syncWorkerConfigFromSettings();
            })
            .catch(err => {
                console.error('ServiceWorker registration failed: ', err);
            });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            void syncWorkerConfigFromSettings();
        });
    });
}

function isServiceWorkerRuntimeSupported(): boolean {
    return window.isSecureContext
        || location.hostname === 'localhost'
        || location.hostname === '127.0.0.1';
}

async function syncWorkerConfigFromSettings(): Promise<void> {
    const settings = loadSettings();
    await syncOfflineServiceWorkerConfig(
        settings.offlineMode,
        settings.tintOfflineTiles
    );
}
