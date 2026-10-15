import { relations } from "drizzle-orm/relations";
import { folders, files, workspaces, products, prices, users, session, customers, collaborators, authenticator, account } from "./schema";

export const filesRelations = relations(files, ({one}) => ({
	folder: one(folders, {
		fields: [files.folderId],
		references: [folders.id]
	}),
	workspace: one(workspaces, {
		fields: [files.workspaceId],
		references: [workspaces.id]
	}),
}));

export const foldersRelations = relations(folders, ({one, many}) => ({
	files: many(files),
	workspace: one(workspaces, {
		fields: [folders.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspacesRelations = relations(workspaces, ({many}) => ({
	files: many(files),
	folders: many(folders),
	collaborators: many(collaborators),
}));

export const pricesRelations = relations(prices, ({one}) => ({
	product: one(products, {
		fields: [prices.productId],
		references: [products.id]
	}),
}));

export const productsRelations = relations(products, ({many}) => ({
	prices: many(prices),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(users, {
		fields: [session.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({one, many}) => ({
	sessions: many(session),
	user: one(users, {
		fields: [users.id],
		references: [users.id],
		relationName: "users_id_users_id"
	}),
	users: many(users, {
		relationName: "users_id_users_id"
	}),
	customers: many(customers),
	authenticators: many(authenticator),
	accounts: many(account),
}));

export const customersRelations = relations(customers, ({one}) => ({
	user: one(users, {
		fields: [customers.id],
		references: [users.id]
	}),
}));

export const collaboratorsRelations = relations(collaborators, ({one}) => ({
	workspace: one(workspaces, {
		fields: [collaborators.workspaceId],
		references: [workspaces.id]
	}),
}));

export const authenticatorRelations = relations(authenticator, ({one}) => ({
	user: one(users, {
		fields: [authenticator.userId],
		references: [users.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(users, {
		fields: [account.userId],
		references: [users.id]
	}),
}));