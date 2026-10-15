// Types for Zotero Library and Item Metadata

export interface ZoteroLink {
  href: string;
  type: string;
  attachmentType?: string;
}

export interface ZoteroLibrary {
  type: string;
  id: number;
  name: string;
  links: {
    alternate: ZoteroLink;
  };
}

export interface ZoteroLinks {
  self: ZoteroLink;
  alternate: ZoteroLink;
  attachment?: ZoteroLink;
  up?: ZoteroLink;
  enclosure?: ZoteroLink;
}

export interface ZoteroCreator {
  creatorType: string;
  firstName: string;
  lastName: string;
}

export interface ZoteroTag {
  tag: string;
  type: number;
}

export interface ZoteroMeta {
  creatorSummary?: string;
  parsedDate?: string;
  numChildren?: number;
}

export interface ZoteroItemData {
  key: string;
  version: number;
  itemType: string;
  title: string;
  creators: ZoteroCreator[];
  abstractNote?: string;
  date: string;
  proceedingsTitle?: string;
  conferenceName?: string;
  place?: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  series?: string;
  language?: string;
  DOI?: string;
  ISBN?: string;
  shortTitle?: string;
  url?: string;
  accessDate?: string;
  archive?: string;
  archiveLocation?: string;
  libraryCatalog?: string;
  callNumber?: string;
  rights?: string;
  extra?: string;
  tags: ZoteroTag[];
  collections: string[];
  relations: Record<string, unknown>;
  dateAdded: string;
  dateModified: string;
  parentItem?: string;
}

export interface ZoteroAttachmentData extends Partial<ZoteroItemData> {
  linkMode?: string;
  contentType?: string;
  charset?: string;
  filename?: string;
  md5?: string;
  mtime?: number;
}

export interface ZoteroItem {
  key: string;
  version: number;
  library: ZoteroLibrary;
  links: ZoteroLinks;
  meta: ZoteroMeta;
  data: ZoteroItemData | ZoteroAttachmentData;
}

// Example usage:
// const items: ZoteroItem[] = ...your JSON data...
