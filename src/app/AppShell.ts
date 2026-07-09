export class AppShell {
    private container: HTMLElement;

    constructor(container: HTMLElement) {
        this.container = container;
    }

    public init(): void {
        this.render();
        this.bindEvents();
    }

    private render(): void {
        this.container.innerHTML = `
            <div style="max-width: 600px; margin: 2rem auto; padding: 2rem; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); text-align: center;">
                <span style="font-size: 4rem;">🥾</span>
                <h1 style="color: #2e4a3f; margin-top: 1rem;">TrailMap PWA</h1>
                <p style="color: #60736c; line-height: 1.6;">Your next-generation offline hiking mapping environment is being initialized.</p>

                <div style="margin: 2rem 0; padding: 1rem; background: #f8faf7; border-radius: 8px; border-left: 4px solid #2e4a3f; text-align: left;">
                    <strong style="display: block; margin-bottom: 0.5rem; color: #2e4a3f;">🔧 Core Diagnostics:</strong>
                    <ul style="margin: 0; padding-left: 1.2rem; font-family: monospace; font-size: 0.9rem; color: #40524a;">
                        <li>OPFS Availability: <span id="diag-opfs">Checking...</span></li>
                        <li>Service Worker Profile: <span id="diag-sw">${'serviceWorker' in navigator ? 'Supported' : 'Unsupported'}</span></li>
                        <li>Online Status: <span id="diag-online">${navigator.onLine ? 'Online 🌐' : 'Offline 🛑'}</span></li>
                    </ul>
                </div>

                <footer style="margin-top: 2rem; font-size: 0.8rem; color: #a0b0aa;">
                    Build Context: ${import.meta.env.MODE.toUpperCase()}
                </footer>
            </div>
        `;
    }

    private bindEvents(): void {
        const opfsEl = document.getElementById('diag-opfs');
        if (opfsEl) {
            opfsEl.textContent = typeof navigator.storage?.getDirectory === 'function'
                ? '✅ Verified (Ready for tile staging)'
                : '❌ Missing (Browser upgrade needed)';
        }

        window.addEventListener('online', () => this.updateOnlineStatus(true));
        window.addEventListener('offline', () => this.updateOnlineStatus(false));
    }

    private updateOnlineStatus(isOnline: boolean): void {
        const onlineEl = document.getElementById('diag-online');
        if (onlineEl) {
            onlineEl.textContent = isOnline ? 'Online 🌐' : 'Offline 🛑';
        }
    }
}
