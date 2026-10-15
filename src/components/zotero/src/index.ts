import ZoteroClient from "./zoteroClient";

declare global {
  var cachedZoteroClient: ZoteroClient;
}

const createZoteroClient = () =>
  new ZoteroClient({
    baseUrl: process.env.ZOTERO_BASE_URL || "https://api.zotero.org",
    apiVersion: process.env.ZOTERO_API_VERSION || "3",
  });

// In development, we want to reuse the same instance across reloads
// In production, we create a new instance
let zoteroClient: ZoteroClient;

if (process.env.NODE_ENV === "production") {
  zoteroClient = createZoteroClient();
} else {
  if (!global.cachedZoteroClient) {
    global.cachedZoteroClient = createZoteroClient();
  }
  zoteroClient = global.cachedZoteroClient;
}

// zoteroClient = createZoteroClient();
export { zoteroClient };
