/* Service worker minimal (installation de l'appli). Aucun cache : la page de connexion est toujours à jour. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
