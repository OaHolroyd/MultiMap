import './styles/app.css';
import { AppShell } from './app/AppShell';

const appContainer = document.getElementById('app');

if (appContainer) {
    const app = new AppShell(appContainer);
    app.init();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./service-worker.js', { type: 'module' })
            .then(registration => {
                console.log('SW registered successfully with scope: ', registration.scope);
            })
            .catch(err => {
                console.error('ServiceWorker registration failed: ', err);
            });
    });
}
