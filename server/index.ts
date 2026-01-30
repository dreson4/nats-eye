import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import auth from "./routes/auth";
import clusters from "./routes/clusters";
import consumers from "./routes/consumers";
import kv from "./routes/kv";
import monitoring from "./routes/monitoring";
import notifications from "./routes/notifications";
import objectstore from "./routes/objectstore";
import stats from "./routes/stats";
import streams from "./routes/streams";
import * as alertMonitor from "./services/alert-monitor";

const app = new Hono();

// Middleware
app.use("*", logger());

// CORS for development
if (process.env.NODE_ENV !== "production") {
	app.use(
		"/api/*",
		cors({
			origin: "http://localhost:5173",
			credentials: true,
		}),
	);
}

// API routes
app.route("/api/auth", auth);
app.route("/api/clusters", clusters);
app.route("/api/consumers", consumers);
app.route("/api/kv", kv);
app.route("/api/monitoring", monitoring);
app.route("/api/notifications", notifications);
app.route("/api/objectstore", objectstore);
app.route("/api/stats", stats);
app.route("/api/streams", streams);

// Initialize alert monitor (auto-starts if was enabled before restart)
alertMonitor.initialize();

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// Serve static files in production
if (process.env.NODE_ENV === "production") {
	app.use("/*", serveStatic({ root: "./dist" }));
	// SPA fallback
	app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT) || 3000;

console.log(`🚀 Server running at http://localhost:${port}`);

export default {
	port,
	fetch: app.fetch,
};
