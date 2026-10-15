import { pgTable, foreignKey, uuid, timestamp, text, jsonb, integer, boolean, pgPolicy, check, bigint, primaryKey, unique, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const pricingPlanInterval = pgEnum("pricing_plan_interval", ['day', 'week', 'month', 'year'])
export const pricingType = pgEnum("pricing_type", ['one_time', 'recurring'])
export const subscriptionStatus = pgEnum("subscription_status", ['trialing', 'active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid'])


export const files = pgTable("files", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	title: text().notNull(),
	iconId: text("icon_id").notNull(),
	data: text(),
	inTrash: text("in_trash"),
	bannerUrl: text("banner_url"),
	workspaceId: uuid("workspace_id").notNull(),
	folderId: uuid("folder_id").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		filesFolderIdFoldersIdFk: foreignKey({
			columns: [table.folderId],
			foreignColumns: [folders.id],
			name: "files_folder_id_folders_id_fk"
		}).onDelete("cascade"),
		filesWorkspaceIdWorkspacesIdFk: foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "files_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
	}
});

export const folders = pgTable("folders", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	title: text().notNull(),
	iconId: text("icon_id").notNull(),
	inTrash: text("in_trash"),
	bannerUrl: text("banner_url"),
	workspaceId: uuid("workspace_id").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => {
	return {
		foldersWorkspaceIdWorkspacesIdFk: foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "folders_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
	}
});

export const workspaces = pgTable("workspaces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	workspaceOwner: uuid("workspace_owner").notNull(),
	title: text().notNull(),
	iconId: text("icon_id").notNull(),
	inTrash: text("in_trash"),
	logo: text(),
	bannerUrl: text("banner_url"),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
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
export const prices = pgTable("prices", {
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
}, (table) => {
	return {
		pricesProductIdFkey: foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "prices_product_id_fkey"
		}),
		allowPublicReadOnlyAccess: pgPolicy("Allow public read-only access.", { as: "permissive", for: "select", to: ["public"] }),
		pricesCurrencyCheck: check("prices_currency_check", sql`char_length(currency) = 3`),
	}
});

export const session = pgTable("session", {
	sessionToken: text().primaryKey().notNull(),
	userId: uuid().notNull(),
	expires: timestamp({ mode: 'string' }).notNull(),
}, (table) => {
	return {
		sessionUserIdFkey: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "session_userId_fkey"
		}).onDelete("cascade"),
		usersCanOnlyAccessTheirOwnSessionData: pgPolicy("Users can only access their own session data", { as: "permissive", for: "all", to: ["public"] }),
	}
});

export const products = pgTable("products", {
	id: text().primaryKey().notNull(),
	active: boolean(),
	name: text(),
	description: text(),
	image: text(),
	metadata: jsonb(),
}, (table) => {
	return {
		allowPublicReadOnlyAccess: pgPolicy("Allow public read-only access.", { as: "permissive", for: "select", to: ["public"] }),
	}
});

export const users = pgTable("users", {
	id: uuid().primaryKey().notNull(),
	name: text(),
	image: text(),
	billingAddress: jsonb("billing_address"),
	paymentMethod: jsonb("payment_method"),
	email: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	emailVerified: timestamp({ mode: 'string' }),
	zoteroAccessToken: text("zotero_access_token").default(''),
	zoteroAccessTokenSecret: text("zotero_access_token_secret").default(''),
	zoteroUserId: text("zotero_user_id").default(''),
	onboardingData: text("onboarding_data").default(''),
}, (table) => {
	return {
		usersIdFkey: foreignKey({
			columns: [table.id],
			foreignColumns: [table.id],
			name: "users_id_fkey"
		}),
		canUpdateOwnUserData: pgPolicy("Can update own user data.", { as: "permissive", for: "update", to: ["public"] }),
		canViewOwnUserData: pgPolicy("Can view own user data.", { as: "permissive", for: "select", to: ["public"] }),
	}
});

export const customers = pgTable("customers", {
	id: uuid().primaryKey().notNull(),
	stripeCustomerId: text("stripe_customer_id"),
}, (table) => {
	return {
		customersIdFkey: foreignKey({
			columns: [table.id],
			foreignColumns: [users.id],
			name: "customers_id_fkey"
		}),
	}
});

export const collaborators = pgTable("collaborators", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	userId: uuid("user_id").notNull(),
}, (table) => {
	return {
		collaboratorsWorkspaceIdWorkspacesIdFk: foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "collaborators_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
	}
});

export const verificationToken = pgTable("verificationToken", {
	identifier: text().notNull(),
	token: text().notNull(),
	expires: timestamp({ mode: 'string' }).notNull(),
}, (table) => {
	return {
		verificationTokenIdentifierTokenPk: primaryKey({ columns: [table.identifier, table.token], name: "verificationToken_identifier_token_pk"}),
	}
});

export const authenticator = pgTable("authenticator", {
	credentialId: text().notNull(),
	userId: uuid().notNull(),
	providerAccountId: text().notNull(),
	credentialPublicKey: text().notNull(),
	counter: integer().notNull(),
	credentialDeviceType: text().notNull(),
	credentialBackedUp: boolean().notNull(),
	transports: text(),
}, (table) => {
	return {
		authenticatorUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "authenticator_userId_users_id_fk"
		}).onDelete("cascade"),
		authenticatorCredentialIdUserIdPk: primaryKey({ columns: [table.credentialId, table.userId], name: "authenticator_credentialID_userId_pk"}),
		authenticatorCredentialIdUnique: unique("authenticator_credentialID_unique").on(table.credentialId),
	}
});

export const account = pgTable("account", {
	userId: uuid().notNull(),
	type: text().notNull(),
	provider: text().notNull(),
	providerAccountId: text().notNull(),
	refreshToken: text("refresh_token"),
	accessToken: text("access_token"),
	tokenType: text("token_type"),
	scope: text(),
	idToken: text("id_token"),
	sessionState: text("session_state"),
	expiresAt: integer("expires_at"),
}, (table) => {
	return {
		accountUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_userId_users_id_fk"
		}).onDelete("cascade"),
		accountProviderProviderAccountIdPk: primaryKey({ columns: [table.provider, table.providerAccountId], name: "account_provider_providerAccountId_pk"}),
	}
});
