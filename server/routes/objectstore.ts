import { Hono } from "hono";
import { connect, type NatsConnection, type ConnectionOptions } from "nats";
import { Objm } from "@nats-io/obj";
import {
	connect as connectWs,
	type NatsConnection as NatsWsConnection,
	type ConnectionOptions as WsConnectionOptions,
	StorageType,
} from "nats.ws";
import { type AuthType, getCluster } from "../db";

// Helper to build NATS connection options (TCP)
function buildConnectionOptions(
	urls: string[],
	authType: AuthType,
	token?: string | null,
	username?: string | null,
	password?: string | null,
): ConnectionOptions {
	const opts: ConnectionOptions = {
		servers: urls,
		timeout: 30000,
	};

	if (authType === "token" && token) {
		opts.token = token;
	} else if (authType === "userpass" && username && password) {
		opts.user = username;
		opts.pass = password;
	}

	return opts;
}

// Helper to build NATS WS connection options
function buildWsConnectionOptions(
	urls: string[],
	authType: AuthType,
	token?: string | null,
	username?: string | null,
	password?: string | null,
): WsConnectionOptions {
	const opts: WsConnectionOptions = {
		servers: urls,
		timeout: 10000,
	};

	if (authType === "token" && token) {
		opts.token = token;
	} else if (authType === "userpass" && username && password) {
		opts.user = username;
		opts.pass = password;
	}

	return opts;
}

// Helper to connect to a cluster using TCP URLs
async function connectToCluster(clusterId: string): Promise<{ nc: NatsConnection; cluster: NonNullable<ReturnType<typeof getCluster>> } | { error: string }> {
	const cluster = getCluster(clusterId);
	if (!cluster) {
		console.log(`[ObjectStore] Cluster not found: ${clusterId}`);
		return { error: "Cluster not found" };
	}

	// Use nats_urls (TCP) if available, otherwise fail with helpful message
	if (!cluster.nats_urls || cluster.nats_urls.length === 0) {
		console.log(`[ObjectStore] No NATS TCP URLs configured for cluster "${cluster.name}" (${clusterId})`);
		return { error: "NATS TCP URLs not configured for this cluster. Please edit the cluster and add NATS URLs." };
	}

	try {
		console.log(`[ObjectStore] Connecting to cluster "${cluster.name}" via TCP: ${cluster.nats_urls.join(", ")}`);
		const opts = buildConnectionOptions(
			cluster.nats_urls,
			cluster.auth_type,
			cluster.token,
			cluster.username,
			cluster.password,
		);
		const nc = await connect(opts);
		console.log(`[ObjectStore] Connected to cluster "${cluster.name}" via TCP`);
		return { nc, cluster };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Connection failed";
		console.error(`[ObjectStore] TCP connection failed for cluster "${cluster.name}": ${msg}`);
		return { error: msg };
	}
}

// Helper to connect to a cluster using WebSocket URLs (fallback when TCP not configured)
async function connectToClusterWs(clusterId: string): Promise<{ nc: NatsWsConnection; cluster: NonNullable<ReturnType<typeof getCluster>> } | { error: string }> {
	const cluster = getCluster(clusterId);
	if (!cluster) {
		console.log(`[ObjectStore] Cluster not found: ${clusterId}`);
		return { error: "Cluster not found" };
	}

	const urls = cluster.urls;
	const connType = "WebSocket";

	try {
		console.log(`[ObjectStore] Connecting to cluster "${cluster.name}" via ${connType}: ${urls.join(", ")}`);
		const opts = buildWsConnectionOptions(
			urls,
			cluster.auth_type,
			cluster.token,
			cluster.username,
			cluster.password,
		);
		const nc = await connectWs(opts);
		console.log(`[ObjectStore] Connected to cluster "${cluster.name}" via ${connType}`);
		return { nc, cluster };
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Connection failed";
		console.error(`[ObjectStore] ${connType} connection failed for cluster "${cluster.name}": ${msg}`);
		return { error: `Failed to connect to NATS cluster "${cluster.name}": ${msg}` };
	}
}

const objectstore = new Hono();

// Health check endpoint
objectstore.get("/health", (c) => {
	return c.json({ status: "ok" });
});

// List all object store buckets for a cluster
objectstore.get("/cluster/:clusterId", async (c) => {
	const clusterId = c.req.param("clusterId");
	console.log(`[ObjectStore] Listing buckets for cluster ${clusterId}`);

	const result = await connectToClusterWs(clusterId);

	if ("error" in result) {
		console.error(`[ObjectStore] Cannot list buckets - connection failed: ${result.error}`);
		return c.json({ error: result.error }, 400);
	}

	const { nc, cluster } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const js = nc.jetstream();
		console.log(`[ObjectStore] Got JetStream manager for cluster "${cluster.name}", listing streams...`);

		const buckets: Array<{
			name: string;
			description?: string;
			size: number;
			storage: string;
			replicas: number;
			sealed: boolean;
			ttl: number;
		}> = [];

		let streamCount = 0;
		let objStreamCount = 0;

		for await (const stream of jsm.streams.list()) {
			streamCount++;
			if (stream.config.name.startsWith("OBJ_")) {
				objStreamCount++;
				const bucketName = stream.config.name.slice(4);
				console.log(`[ObjectStore] Found object store stream: ${stream.config.name} (bucket: ${bucketName})`);

				try {
					const os = await js.views.os(bucketName);
					const status = await os.status();
					buckets.push({
						name: status.bucket,
						description: status.description,
						size: status.size,
						storage: status.storage === StorageType.Memory ? "memory" : "file",
						replicas: status.replicas,
						sealed: status.sealed,
						ttl: status.ttl,
					});
					console.log(`[ObjectStore] Bucket "${bucketName}": size=${status.size}, storage=${status.storage === StorageType.Memory ? "memory" : "file"}, replicas=${status.replicas}`);
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error(`[ObjectStore] Failed to get status for bucket "${bucketName}": ${msg}`);
					// Still include it with basic info from the stream
					buckets.push({
						name: bucketName,
						description: stream.config.description,
						size: stream.state.bytes,
						storage: stream.config.storage === StorageType.Memory ? "memory" : "file",
						replicas: stream.config.num_replicas || 1,
						sealed: stream.config.sealed || false,
						ttl: stream.config.max_age || 0,
					});
				}
			}
		}

		console.log(`[ObjectStore] Cluster "${cluster.name}": found ${streamCount} total streams, ${objStreamCount} object store streams, ${buckets.length} buckets`);
		return c.json(buckets);
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Failed to list buckets";
		console.error(`[ObjectStore] Error listing buckets for cluster "${cluster.name}": ${msg}`);
		if (error instanceof Error && error.stack) {
			console.error(`[ObjectStore] Stack trace: ${error.stack}`);
		}
		return c.json({ error: msg }, 500);
	} finally {
		await nc.close().catch(() => {});
		console.log(`[ObjectStore] Closed connection to cluster "${cluster.name}"`);
	}
});

// Delete an object store bucket
objectstore.delete("/cluster/:clusterId/bucket/:bucket", async (c) => {
	const clusterId = c.req.param("clusterId");
	const bucketName = c.req.param("bucket");
	console.log(`[ObjectStore] Deleting bucket "${bucketName}" from cluster ${clusterId}`);

	const result = await connectToClusterWs(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc, cluster } = result;

	try {
		const jsm = await nc.jetstreamManager();
		await jsm.streams.delete(`OBJ_${bucketName}`);
		console.log(`[ObjectStore] Deleted bucket "${bucketName}" from cluster "${cluster.name}"`);
		return c.json({ success: true });
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Failed to delete bucket";
		console.error(`[ObjectStore] Failed to delete bucket "${bucketName}": ${msg}`);
		return c.json({ error: msg }, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Upload file to object store bucket
// This endpoint exists because nats.ws has issues with binary encoding (btoa) in browsers
// We use the native 'nats' package + @nats-io/obj here which doesn't have this limitation
objectstore.post("/cluster/:clusterId/bucket/:bucket/upload", async (c) => {
	const clusterId = c.req.param("clusterId");
	const bucketName = c.req.param("bucket");
	console.log(`[ObjectStore] Upload request for bucket "${bucketName}" in cluster ${clusterId}`);

	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		console.error(`[ObjectStore] Upload failed - cannot connect: ${result.error}`);
		return c.json({ error: result.error }, 400);
	}

	const { nc, cluster } = result;

	try {
		const formData = await c.req.formData();
		const file = formData.get("file") as File | null;

		if (!file) {
			console.error(`[ObjectStore] Upload failed - no file in request body`);
			return c.json({ error: "No file provided" }, 400);
		}

		console.log(`[ObjectStore] Uploading file "${file.name}" (${file.size} bytes) to bucket "${bucketName}" in cluster "${cluster.name}"`);

		const objm = new Objm(nc);
		const os = await objm.open(bucketName);

		const arrayBuffer = await file.arrayBuffer();
		const data = new Uint8Array(arrayBuffer);

		console.log(`[ObjectStore] Data ready, ${data.length} bytes. Uploading to "${bucketName}"...`);

		const info = await os.putBlob({ name: file.name }, data);

		console.log(`[ObjectStore] Upload complete: "${info.name}" (${info.size} bytes, ${info.chunks} chunks) to bucket "${bucketName}"`);

		return c.json({
			success: true,
			name: info.name,
			size: info.size,
			chunks: info.chunks,
			digest: info.digest,
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Failed to upload file";
		console.error(`[ObjectStore] Upload error for bucket "${bucketName}" in cluster "${cluster.name}": ${msg}`);
		if (error instanceof Error && error.stack) {
			console.error(`[ObjectStore] Stack trace: ${error.stack}`);
		}
		return c.json({ error: msg }, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

export default objectstore;
