import {
  pgTable,
  foreignKey,
  uuid,
  timestamp,
  text,
  jsonb,
  integer,
  boolean,
  pgPolicy,
  check,
  bigint,
  primaryKey,
  unique,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { AdapterAccountType } from "next-auth/adapters";

export const pricingPlanInterval = pgEnum("pricing_plan_interval", [
  "day",
  "week",
  "month",
  "year",
]);
export const pricingType = pgEnum("pricing_type", ["one_time", "recurring"]);
export const subscriptionStatus = pgEnum("subscription_status", [
  "trialing",
  "active",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "unpaid",
]);

export const files = pgTable(
  "files",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    title: text().notNull(),
    iconId: text("icon_id").notNull(),
    data: text(),
    inTrash: text("in_trash"),
    bannerUrl: text("banner_url"),
    workspaceId: uuid("workspace_id").notNull(),
    folderId: uuid("folder_id").notNull(),
  },
  (table) => {
    return {
      filesFolderIdFoldersIdFk: foreignKey({
        columns: [table.folderId],
        foreignColumns: [folders.id],
        name: "files_folder_id_folders_id_fk",
      }).onDelete("cascade"),
      filesWorkspaceIdWorkspacesIdFk: foreignKey({
        columns: [table.workspaceId],
        foreignColumns: [workspaces.id],
        name: "files_workspace_id_workspaces_id_fk",
      }).onDelete("cascade"),
    };
  }
);

export const folders = pgTable(
  "folders",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    title: text().notNull(),
    iconId: text("icon_id").notNull(),
    inTrash: text("in_trash"),
    bannerUrl: text("banner_url"),
    workspaceId: uuid("workspace_id").notNull(),
  },
  (table) => {
    return {
      foldersWorkspaceIdWorkspacesIdFk: foreignKey({
        columns: [table.workspaceId],
        foreignColumns: [workspaces.id],
        name: "folders_workspace_id_workspaces_id_fk",
      }).onDelete("cascade"),
    };
  }
);

export const workspaces = pgTable("workspaces", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  workspaceOwner: uuid("workspace_owner").notNull(),
  title: text().notNull(),
  iconId: text("icon_id").notNull(),
  inTrash: text("in_trash"),
  logo: text(),
  bannerUrl: text("banner_url"),
});

export const subscriptions = pgTable("subscriptions", {
  id: text().primaryKey().notNull(),
  userId: uuid("user_id").notNull(),
  status: subscriptionStatus(),
  metadata: jsonb(),
  priceId: text("price_id"),
  quantity: integer(),
  cancelAtPeriodEnd: boolean("cancel_at_period_end"),
  created: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
  currentPeriodStart: timestamp("current_period_start", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  currentPeriodEnd: timestamp("current_period_end", {
    withTimezone: true,
    mode: "string",
  })
    .defaultNow()
    .notNull(),
  endedAt: timestamp("ended_at", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  cancelAt: timestamp("cancel_at", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  canceledAt: timestamp("canceled_at", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  trialStart: timestamp("trial_start", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
  trialEnd: timestamp("trial_end", {
    withTimezone: true,
    mode: "string",
  }).defaultNow(),
});

export const prices = pgTable(
  "prices",
  {
    id: text().primaryKey().notNull(),
    productId: text("product_id"),
    active: boolean(),
    description: text(),
    // You can use { mode: "bigint" } if numbers are exceeding js number limitations
    unitAmount: bigint("unit_amount", { mode: "number" }),
    currency: text(),
    type: pricingType(),
    interval: pricingPlanInterval(),
    intervalCount: integer("interval_count"),
    trialPeriodDays: integer("trial_period_days"),
    metadata: jsonb(),
  },
  (table) => {
    return {
      pricesProductIdFkey: foreignKey({
        columns: [table.productId],
        foreignColumns: [products.id],
        name: "prices_product_id_fkey",
      }),
      allowPublicReadOnlyAccess: pgPolicy("Allow public read-only access.", {
        as: "permissive",
        for: "select",
        to: ["public"],
      }),
      pricesCurrencyCheck: check(
        "prices_currency_check",
        sql`char_length(currency) = 3` as any
      ),
    };
  }
);

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: uuid("userId").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => {
    return {
      sessionUserIdFkey: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "session_userId_fkey",
      }).onDelete("cascade"),
      usersCanOnlyAccessTheirOwnSessionData: pgPolicy(
        "Users can only access their own session data",
        { as: "permissive", for: "all", to: ["public"] }
      ),
    };
  }
);

export const products = pgTable(
  "products",
  {
    id: text().primaryKey().notNull(),
    active: boolean(),
    name: text(),
    description: text(),
    image: text(),
    metadata: jsonb(),
  },
  (table) => {
    return {
      allowPublicReadOnlyAccess: pgPolicy("Allow public read-only access.", {
        as: "permissive",
        for: "select",
        to: ["public"],
      }),
    };
  }
);

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().notNull(),
    name: text("name"),
    image: text("image"),
    billingAddress: jsonb("billing_address"),
    paymentMethod: jsonb("payment_method"),
    email: text().unique().notNull(),
    password: text(),
    zoteroAccessToken: text("zotero_access_token").default(""),
    zoteroAccessTokenSecret: text("zotero_access_token_secret").default(""),
    zoteroUserId: text("zotero_user_id").default(""),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    onBoardingData: text("onboarding_data").default(""),
    allowAccess : boolean("allow_access").default(false),
  },
  (table) => {
    return {
      usersIdFkey: foreignKey({
        columns: [table.id],
        foreignColumns: [table.id],
        name: "users_id_fkey",
      }),
      canUpdateOwnUserData: pgPolicy("Can update own user data.", {
        as: "permissive",
        for: "update",
        to: ["public"],
      }),
      canViewOwnUserData: pgPolicy("Can view own user data.", {
        as: "permissive",
        for: "select",
        to: ["public"],
      }),
    };
  }
);

export const customers = pgTable(
  "customers",
  {
    id: uuid().primaryKey().notNull(),
    stripeCustomerId: text("stripe_customer_id"),
  },
  (table) => {
    return {
      customersIdFkey: foreignKey({
        columns: [table.id],
        foreignColumns: [users.id],
        name: "customers_id_fkey",
      }),
    };
  }
);

export const collaborators = pgTable(
  "collaborators",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    userId: uuid("user_id").notNull(),
  },
  (table) => {
    return {
      collaboratorsWorkspaceIdWorkspacesIdFk: foreignKey({
        columns: [table.workspaceId],
        foreignColumns: [workspaces.id],
        name: "collaborators_workspace_id_workspaces_id_fk",
      }).onDelete("cascade"),
    };
  }
);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => ({
    compoundKey: primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  })
);

export const authenticators = pgTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: boolean("credentialBackedUp").notNull(),
    transports: text("transports"),
  },
  (authenticator) => ({
    compoundKey: primaryKey({
      columns: [authenticator.credentialID, authenticator.userId],
    }),
  })
);

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

// Enums
export const paperTypeEnum = pgEnum("paper_type", [
  "journal",
  "conference",
  "preprint",
  "thesis",
  "book",
  "other",
]);

export const paperSourceEnum = pgEnum("paper_source", [
  "zotero",
  "manual",
  "other",
]);

export const papers = pgTable(
  "papers",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    externalId: text("external_id"),
    externalSource: text("external_source"),

    // Basic metadata
    title: text("title").notNull(),
    type: paperTypeEnum("paper_type").notNull(),
    source: paperSourceEnum("source").notNull(),
    abstract: text("abstract"),
    doi: text("doi"),

    // File related fields
    uploadUrl: text("upload_url"),
    fileType: text("file_type"),

    // System fields with foreign keys
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    fileId: uuid("file_id").references(() => files.id, {
      onDelete: "set null",
    }),

    // Timestamps
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    // Indexes
    externalIdx: index("idx_papers_external").on(
      table.externalId,
      table.externalSource
    ),
    uniquePaperPerWorkspace: unique().on(table.title, table.workspaceId),
    userIdx: index("idx_papers_user").on(table.userId),
    typeIdx: index("idx_papers_type").on(table.type),
    uploadUrlCheck: check(
      "upload_url_check",
      sql`upload_url IS NULL OR upload_url ~ '^https?://'`
    ),
    doiCheck: check("doi_check", sql`doi IS NULL OR doi ~ '^10\.'`),
  })
);
