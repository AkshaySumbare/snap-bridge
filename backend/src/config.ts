import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecret: process.env.JWT_SECRET ?? "dev-secret-change-me",
  databasePath: process.env.DATABASE_PATH ?? "./data/snapbridge.db",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
};
