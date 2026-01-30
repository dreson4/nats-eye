import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { connect, type ConnectionOptions } from "nats.ws";
import { z } from "zod";
import {
	type AuthType,
	createCluster,
	deleteCluster,
	getAllClusters,
	getCluster,
	updateCluster,
} from "../db";

// Zod schemas
const wsUrlSchema = z
	.string()
	.transform((url) => url.trim())
	.refine((url) => url.length > 0, { message: "URL is required" })
	.refine(
		(url) => {
			try {
				const parsed = new URL(url);
				return parsed.protocol === "ws:" || parsed.protocol === "wss:";
			} catch {
				return false;
			}
		},
		{ message: "Must be a valid WebSocket URL (ws:// or wss://)" },
	);

const natsUrlSchema = z
	.string()
	.transform((url) => url.trim())
	.refine((url) => url.length > 0, { message: "URL is required" });

const authTypeSchema = z.enum(["none", "token", "userpass"]);

const createClusterSchema = z.object({
	name: z.string().min(1).max(100),
	urls: z.array(wsUrlSchema).min(1).max(10),
	natsUrls: z.array(natsUrlSchema).min(1).max(10).optional(),
	authType: authTypeSchema.default("none"),
	token: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
});

const updateClusterSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	urls: z.array(wsUrlSchema).min(1).max(10).optional(),
	natsUrls: z.array(natsUrlSchema).min(1).max(10).optional().nullable(),
	authType: authTypeSchema.optional(),
	token: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
});

const testConnectionSchema = z.object({
	urls: z.array(z.string()).min(1),
	token: z.string().optional(),
	username: z.string().optional(),
	password: z.string().optional(),
});

// Helper to build NATS connection options
function buildConnectionOptions(
	urls: string[],
	authType: AuthType,
	token?: string | null,
	username?: string | null,
	password?: string | null,
): ConnectionOptions {
	const opts: ConnectionOptions = {
		servers: urls,
		timeout: 5000,
	};

	if (authType === "token" && token) {
		opts.token = token;
	} else if (authType === "userpass" && username && password) {
		opts.user = username;
		opts.pass = password;
	}

	return opts;
}

// Helper to sanitize cluster for client response
function sanitizeCluster(cluster: ReturnType<typeof getCluster>) {
	if (!cluster) return null;
	return {
		id: cluster.id,
		name: cluster.name,
		urls: cluster.urls,
		natsUrls: cluster.nats_urls,
		authType: cluster.auth_type,
		hasToken: !!cluster.token,
		hasUserPass: !!cluster.username && !!cluster.password,
		createdAt: cluster.created_at,
		updatedAt: cluster.updated_at,
	};
}

const clusters = new Hono();

// Get all clusters
clusters.get("/", (c) => {
	const allClusters = getAllClusters();
	const sanitized = allClusters.map(sanitizeCluster);
	return c.json(sanitized);
});

// Get single cluster
clusters.get("/:id", (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	return c.json(sanitizeCluster(cluster));
});

// Create cluster
clusters.post("/", zValidator("json", createClusterSchema), (c) => {
	const { name, urls, natsUrls, authType, token, username, password } = c.req.valid("json");
	const cluster = createCluster(name, urls, authType, token, username, password, natsUrls);

	return c.json(sanitizeCluster(cluster), 201);
});

// Update cluster
clusters.patch("/:id", zValidator("json", updateClusterSchema), (c) => {
	const id = c.req.param("id");
	const data = c.req.valid("json");

	const updated = updateCluster(id, {
		name: data.name,
		urls: data.urls,
		nats_urls: data.natsUrls,
		auth_type: data.authType,
		token: data.token,
		username: data.username,
		password: data.password,
	});

	if (!updated) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	return c.json(sanitizeCluster(updated));
});

// Delete cluster
clusters.delete("/:id", (c) => {
	const id = c.req.param("id");
	const deleted = deleteCluster(id);

	if (!deleted) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	return c.json({ success: true });
});

// Test connection (with provided credentials)
clusters.post("/test", zValidator("json", testConnectionSchema), async (c) => {
	const { urls, token, username, password } = c.req.valid("json");

	// Determine auth type from provided credentials
	let authType: AuthType = "none";
	if (token) {
		authType = "token";
	} else if (username && password) {
		authType = "userpass";
	}

	try {
		const opts = buildConnectionOptions(urls, authType, token, username, password);
		const nc = await connect(opts);

		const serverInfo = nc.info;
		await nc.close();

		return c.json({
			success: true,
			serverInfo: serverInfo
				? {
						serverName: serverInfo.server_name,
						version: serverInfo.version,
						jetstream: serverInfo.jetstream ?? false,
					}
				: null,
		});
	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Connection failed",
		});
	}
});

// Test existing cluster connection
clusters.post("/:id/test", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	try {
		const opts = buildConnectionOptions(
			cluster.urls,
			cluster.auth_type,
			cluster.token,
			cluster.username,
			cluster.password,
		);
		const nc = await connect(opts);

		const serverInfo = nc.info;
		await nc.close();

		return c.json({
			success: true,
			serverInfo: serverInfo
				? {
						serverName: serverInfo.server_name,
						version: serverInfo.version,
						jetstream: serverInfo.jetstream ?? false,
					}
				: null,
		});
	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Connection failed",
		});
	}
});

// Get connection info for frontend direct connection
clusters.get("/:id/connect", (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	// Return connection info for the frontend
	return c.json({
		urls: cluster.urls,
		authType: cluster.auth_type,
		token: cluster.auth_type === "token" ? cluster.token : undefined,
		username: cluster.auth_type === "userpass" ? cluster.username : undefined,
		password: cluster.auth_type === "userpass" ? cluster.password : undefined,
	});
});

export default clusters;
