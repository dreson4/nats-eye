import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	connect,
	type NatsConnection,
	type ConnectionOptions,
	type KvEntry,
	StorageType,
} from "nats.ws";
import { z } from "zod";
import { type AuthType, getCluster } from "../db";

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

// Helper to connect to a cluster
async function connectToCluster(clusterId: string): Promise<{ nc: NatsConnection; cluster: NonNullable<ReturnType<typeof getCluster>> } | { error: string }> {
	const cluster = getCluster(clusterId);
	if (!cluster) {
		return { error: "Cluster not found" };
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
		return { nc, cluster };
	} catch (error) {
		return { error: error instanceof Error ? error.message : "Connection failed" };
	}
}

// Format KV entry for response
function formatKvEntry(entry: KvEntry) {
	return {
		key: entry.key,
		value: new TextDecoder().decode(entry.value),
		revision: entry.revision,
		created: entry.created.toISOString(),
		operation: entry.operation,
	};
}

// Zod schemas
const createBucketSchema = z.object({
	name: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores, and hyphens"),
	description: z.string().max(4096).optional(),
	maxValueSize: z.number().int().min(-1).default(-1),
	history: z.number().int().min(1).max(64).default(1),
	ttl: z.number().int().min(0).default(0), // nanoseconds
	maxBytes: z.number().int().min(-1).default(-1),
	storage: z.enum(["file", "memory"]).default("file"),
	replicas: z.number().int().min(1).max(5).default(1),
});

const putKeySchema = z.object({
	key: z.string().min(1),
	value: z.string(),
});

const kv = new Hono();

// List all KV buckets for a cluster
kv.get("/cluster/:clusterId", async (c) => {
	const clusterId = c.req.param("clusterId");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const buckets: Array<{
			name: string;
			description?: string;
			history: number;
			ttl: number;
			maxBytes: number;
			maxValueSize: number;
			storage: string;
			replicas: number;
			size: number;
			values: number;
		}> = [];

		// List streams and filter for KV_ prefix
		const jsm = await nc.jetstreamManager();
		const streamLister = jsm.streams.list();

		// Iterate through all streams
		for await (const stream of streamLister) {
			if (stream.config.name.startsWith("KV_")) {
				const bucketName = stream.config.name.slice(3); // Remove "KV_" prefix
				buckets.push({
					name: bucketName,
					description: stream.config.description,
					history: stream.config.max_msgs_per_subject || 1,
					ttl: stream.config.max_age || 0,
					maxBytes: stream.config.max_bytes || -1,
					maxValueSize: stream.config.max_msg_size || -1,
					storage: stream.config.storage === StorageType.File ? "file" : "memory",
					replicas: stream.config.num_replicas || 1,
					size: stream.state.bytes,
					values: stream.state.messages,
				});
			}
		}

		return c.json(buckets);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to list KV buckets",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get a single KV bucket info
kv.get("/cluster/:clusterId/bucket/:name", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const jsm = await nc.jetstreamManager();
		const bucket = await js.views.kv(name);
		const status = await bucket.status();

		// Get the underlying stream to check storage type
		const streamInfo = await jsm.streams.info(`KV_${name}`);
		const storageType = streamInfo.config.storage === StorageType.File ? "file" : "memory";

		return c.json({
			name: status.bucket,
			description: status.description,
			history: status.history,
			ttl: status.ttl,
			maxBytes: status.max_bytes,
			maxValueSize: status.maxValueSize,
			storage: storageType,
			replicas: status.replicas,
			size: status.size,
			values: status.values,
		});
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Bucket not found",
		}, 404);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Create a new KV bucket
kv.post("/cluster/:clusterId", zValidator("json", createBucketSchema), async (c) => {
	const clusterId = c.req.param("clusterId");
	const data = c.req.valid("json");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(data.name, {
			description: data.description,
			max_bytes: data.maxBytes,
			history: data.history,
			ttl: data.ttl,
			maxValueSize: data.maxValueSize,
			storage: data.storage === "file" ? StorageType.File : StorageType.Memory,
			replicas: data.replicas,
		});

		const status = await bucket.status();
		return c.json({
			name: status.bucket,
			description: status.description,
			history: status.history,
			ttl: status.ttl,
			maxBytes: status.max_bytes,
			maxValueSize: status.maxValueSize,
			replicas: status.replicas,
			size: status.size,
			values: status.values,
		}, 201);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to create bucket",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Delete a KV bucket
kv.delete("/cluster/:clusterId/bucket/:name", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		await js.views.kv(name, { bindOnly: true });

		// Delete the underlying stream
		const jsm = await nc.jetstreamManager();
		await jsm.streams.delete(`KV_${name}`);

		return c.json({ success: true });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to delete bucket",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// List all keys in a bucket
kv.get("/cluster/:clusterId/bucket/:name/keys", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);

		const keysMap = new Map<string, {
			key: string;
			value: string;
			revision: number;
			created: string;
		}>();

		// Get all history entries for all keys (">") to build current state
		const history = await bucket.history({ key: ">" });

		for await (const entry of history) {
			if (entry.operation === "PUT") {
				// Store/update the entry (last one wins for each key)
				keysMap.set(entry.key, {
					key: entry.key,
					value: new TextDecoder().decode(entry.value),
					revision: entry.revision,
					created: entry.created.toISOString(),
				});
			} else if (entry.operation === "DEL" || entry.operation === "PURGE") {
				// Remove deleted keys
				keysMap.delete(entry.key);
			}
		}

		return c.json(Array.from(keysMap.values()));
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to list keys",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get a single key
kv.get("/cluster/:clusterId/bucket/:name/key/:key", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const key = c.req.param("key");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);
		const entry = await bucket.get(key);

		if (!entry || entry.operation !== "PUT") {
			return c.json({ error: "Key not found" }, 404);
		}

		return c.json(formatKvEntry(entry));
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to get key",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get key history
kv.get("/cluster/:clusterId/bucket/:name/key/:key/history", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const key = c.req.param("key");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);

		const history: Array<{
			key: string;
			value: string;
			revision: number;
			created: string;
			operation: string;
		}> = [];

		const iter = await bucket.history({ key });
		for await (const entry of iter) {
			history.push({
				key: entry.key,
				value: new TextDecoder().decode(entry.value),
				revision: entry.revision,
				created: entry.created.toISOString(),
				operation: entry.operation,
			});
		}

		return c.json(history);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to get history",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Put a key
kv.put("/cluster/:clusterId/bucket/:name/key", zValidator("json", putKeySchema), async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const data = c.req.valid("json");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);
		const revision = await bucket.put(data.key, new TextEncoder().encode(data.value));

		const entry = await bucket.get(data.key);
		if (entry) {
			return c.json(formatKvEntry(entry));
		}

		return c.json({ key: data.key, revision });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to put key",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Delete a key
kv.delete("/cluster/:clusterId/bucket/:name/key/:key", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const key = c.req.param("key");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);
		await bucket.delete(key);

		return c.json({ success: true });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to delete key",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Purge a key (remove all history)
kv.post("/cluster/:clusterId/bucket/:name/key/:key/purge", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const key = c.req.param("key");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const js = nc.jetstream();
		const bucket = await js.views.kv(name);
		await bucket.purge(key);

		return c.json({ success: true });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to purge key",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

export default kv;
