import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
// import * as schema from '../../supabase/migrations/schema';
// import * as schema from ''
import * as schema from "@/db/schema";

const queryClient = postgres(process.env.DATABASE_URL!, { max: 1 });
// const db = drizzle({ client: queryClient});
const db = drizzle({ client: queryClient, schema: schema });
export default db;

// const connectionString = "postgres://postgres:postgres@localhost:5432/drizzle"
// const pool = postgres(connectionString, { max: 1 })

// export const db = drizzle(pool)
