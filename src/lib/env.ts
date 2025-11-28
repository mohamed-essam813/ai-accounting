import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWT_SECRET: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(), // File path (local dev)
  GOOGLE_CLOUD_CREDENTIALS_JSON: z.string().optional(), // JSON string (serverless/Vercel)
});

const clientEnvSchema = envSchema.pick({
  NEXT_PUBLIC_APP_URL: true,
  NEXT_PUBLIC_SUPABASE_URL: true,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: true,
});

type ServerEnv = z.infer<typeof envSchema>;
type ClientEnv = z.infer<typeof clientEnvSchema>;

declare global {
  var __env: ServerEnv | undefined;
}

function getEnv(): ServerEnv {
  if (globalThis.__env) {
    return globalThis.__env;
  }

  // Debug: Log what we're getting from process.env (only in dev, server-side only)
  if (process.env.NODE_ENV !== "production" && typeof window === "undefined") {
    console.log("[env.ts] Checking environment variables...");
    console.log("[env.ts] SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "MISSING");
    console.log("[env.ts] SUPABASE_JWT_SECRET:", process.env.SUPABASE_JWT_SECRET ? "SET" : "MISSING");
    console.log("[env.ts] OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "SET" : "MISSING");
  }

  const parsed = envSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    GOOGLE_CLOUD_CREDENTIALS_JSON: process.env.GOOGLE_CLOUD_CREDENTIALS_JSON,
  });

  if (!parsed.success) {
    const messages = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(", ");
    const missingVars = parsed.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Invalid environment variables: ${messages}\n\n` +
      `Missing or invalid variables: ${missingVars}\n\n` +
      `Please check your .env.local file and ensure all required variables are set.\n` +
      `See env.example for the required format.\n\n` +
      `If you just created/updated .env.local, restart your dev server with: npm run dev\n\n` +
      `Current working directory: ${process.cwd()}\n` +
      `NODE_ENV: ${process.env.NODE_ENV || "undefined"}`
    );
  }

  if (process.env.NODE_ENV !== "production") {
    globalThis.__env = parsed.data;
  }

  return parsed.data;
}

// Lazy evaluation: only validate server env vars when actually accessed (server-side only)
// This prevents errors when the module is imported in client components
let _env: ServerEnv | undefined;

export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop) {
    if (typeof window !== "undefined") {
      throw new Error(
        `Cannot access server environment variable '${String(prop)}' in client component. ` +
        `Server environment variables are only available in server components, API routes, and server actions.`
      );
    }
    if (!_env) {
      _env = getEnv();
    }
    return _env[prop as keyof ServerEnv];
  },
});

export const clientEnv: ClientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

