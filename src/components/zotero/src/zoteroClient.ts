import { auth } from "@/auth";
import { zoteroClientConfig } from "../zotero-config";
import { ZoteroItem } from "../types";

interface ZoteroCredentials {
  zoteroUserId: string;
  zoteroAccessToken: string;
  zoteroAccessTokenSecret: string;
}

interface ZoteroClientConstructorParams {
  baseUrl: string;
  apiVersion: string;
  credentials?: ZoteroCredentials;
}

export default class ZoteroClient {
  private readonly zoteroBaseUrl = "https://api.zotero.org";
  private readonly config = zoteroClientConfig;
  private credentials?: ZoteroCredentials;

  constructor({
    baseUrl,
    apiVersion,
    credentials,
  }: ZoteroClientConstructorParams) {
    this.credentials = credentials;
  }

  async status(credentials?: ZoteroCredentials) {
    if (credentials) {
      this.credentials = credentials;
      return {
        status: true,
        message: "Credentials updated successfully",
        data: this.credentials,
      };
    }

    const auth = await this.ensureAuthenticated();
    return {
      status: auth.status,
      message: auth.message,
      data: auth.credentials || null,
    };
  }

  private async ensureAuthenticated(): Promise<{
    status: boolean;
    message: string;
    credentials?: ZoteroCredentials;
  }> {
    if (this.credentials) {
      return {
        status: true,
        message: "Already authenticated",
        credentials: this.credentials,
      };
    }

    try {
      const session = await auth();
      if (!session?.user) {
        return {
          status: false,
          message: "Not authenticated",
        };
      }

      const { zoteroUserId, zoteroAccessToken, zoteroAccessTokenSecret } =
        session.user;

      if (!zoteroUserId || !zoteroAccessToken || !zoteroAccessTokenSecret) {
        return {
          status: false,
          message: "Missing Zotero credentials",
        };
      }

      this.credentials = {
        zoteroUserId,
        zoteroAccessToken,
        zoteroAccessTokenSecret,
      };

      return {
        status: true,
        message: "Authentication successful",
        credentials: this.credentials,
      };
    } catch (error) {
      console.error("Authentication error:", error);
      return {
        status: false,
        message: "Authentication failed",
      };
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ status: boolean; message: string; data: T | null }> {
    const auth = await this.ensureAuthenticated();
    if (!auth.status || !auth.credentials) {
      return {
        status: false,
        message: auth.message,
        data: null,
      };
    }

    const { zoteroUserId, zoteroAccessToken } = auth.credentials;
    const url = `${this.zoteroBaseUrl}/users/${zoteroUserId}/${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${zoteroAccessToken}`,
        },
      });

      if (!response.ok) {
        console.error(`HTTP error! status: ${response.status}`);
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return {
        status: true,
        message: "Request successful",
        data,
      };
    } catch (error) {
      console.error(`Request failed for ${endpoint}:`, error);
      return {
        status: false,
        message: error instanceof Error ? error.message : "Request failed",
        data: null,
      };
    }
  }

  async collections() {
    return this.makeRequest<{
      key: string;
      version: number;
      library: { type: string; id: number };
      links: { self: { href: string } };
      meta: { numCollections: number; numItems: number };
      data: {
        key: string;
        version: number;
        name: string;
        parentCollection: false | string;
        links: { self: { href: string } };
      }[];
    }>("collections");
  }

  async publications() {
    return this.makeRequest<{
      key: string;
      version: number;
      library: { type: string; id: number };
      links: { self: { href: string } };
      meta: { numCollections: number; numItems: number };
      data: {
        key: string;
        version: number;
        name: string;
        parentCollection: false | string;
        links: { self: { href: string } };
      }[];
    }>("publications/items");
  }

  async items({ searchParams }: { searchParams?: string } = {}) {
    const endpoint = `items?itemType=attachment${
      searchParams ? `&${searchParams}` : ""
    }`;

    const attachments = await this.makeRequest<any[]>(endpoint);
    if (!attachments.status || !attachments.data) {
      return attachments;
    }

    // Get unique parent item keys
    const itemKeys = [
      ...new Set(
        attachments.data
          .filter((item) => item.data.contentType === "application/pdf")
          .map((item) => item.data.parentItem || item.data.key)
      ),
    ];

    if (itemKeys.length === 0) {
      return {
        status: true,
        message: "No PDF items found",
        data: [],
      };
    }

    const items = await this.makeRequest<ZoteroItem[]>(
      `items?itemKey=${itemKeys.join(",")}`
    );

    if (!items.status || !items.data) {
      return items;
    }

    // Filter by supported types
    const supportedTypes = this.config.supportedFiles.map(
      (file) => file.itemType
    );
    const filteredItems = items.data.filter(
      (item) => supportedTypes.includes(item.data.itemType || "") // TODO: Check if item.data.itemType is always defined
    );

    return {
      status: true,
      message: "Items fetched successfully",
      data: filteredItems,
    };
  }
  async item({ itemKey }: { itemKey: string }) {
    const auth = await this.ensureAuthenticated();
    if (!auth.status || !auth.credentials) {
      return {
        status: false,
        message: auth.message,
        data: null,
      };
    }

    const item = await this.makeRequest<ZoteroItem>(`items/${itemKey}`);
    if (!item.status || !item.data) {
      return item;
    }

    return {
      status: true,
      message: "Item fetched successfully",
      data: item.data,
    };
  }
  async file({ itemKey }: { itemKey: string }) {
    const auth = await this.ensureAuthenticated();
    if (!auth.status || !auth.credentials) {
      return {
        status: false,
        message: auth.message,
        data: null,
      };
    }

    try {
      const { zoteroUserId, zoteroAccessToken } = auth.credentials;
      const response = await fetch(
        `${this.zoteroBaseUrl}/users/${zoteroUserId}/items/${itemKey}/file`,
        {
          headers: {
            Authorization: `Bearer ${zoteroAccessToken}`,
          },
          redirect: "follow",
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} `);
      }

      const fileBlob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
        : `zotero-file-${itemKey}`;
      const eTag = response.headers.get("ETag");

      return {
        status: true,
        message: "File fetched successfully",
        data: { blob: fileBlob, filename, eTag },
      };
    } catch (error) {
      console.error("File download error:", error);
      return {
        status: false,
        message:
          error instanceof Error ? error.message : "File download failed",
        data: null,
      };
    }
  }
}
