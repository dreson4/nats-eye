import { Hono } from "hono";
import { connect, type NatsConnection, type ConnectionOptions } from "nats";
import { Objm } from "@nats-io/obj";
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

// Helper to connect to a cluster using TCP URLs
async function connectToCluster(clusterId: string): Promise<{ nc: NatsConnection; cluster: NonNullable<ReturnType<typeof getCluster>> } | { error: string }> {
	const cluster = getCluster(clusterId);
	if (!cluster) {
		return { error: "Cluster not found" };
	}

	// Use nats_urls (TCP) if available, otherwise fail with helpful message
	if (!cluster.nats_urls || cluster.nats_urls.length === 0) {
		return { error: "NATS TCP URLs not configured for this cluster. Please edit the cluster and add NATS URLs." };
	}

	try {
		const opts = buildConnectionOptions(
			cluster.nats_urls,
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

const objectstore = new Hono();

// Health check endpoint
objectstore.get("/health", (c) => {
	return c.json({ status: "ok", note: "Most Object Store operations are handled on the frontend via nats.ws. Upload uses backend due to browser btoa limitations." });
});

// Upload file to object store bucket
// This endpoint exists because nats.ws has issues with binary encoding (btoa) in browsers
// We use the native 'nats' package + @nats-io/obj here which doesn't have this limitation
objectstore.post("/cluster/:clusterId/bucket/:bucket/upload", async (c) => {
	const clusterId = c.req.param("clusterId");
	const bucketName = c.req.param("bucket");

	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		// Parse multipart form data
		const formData = await c.req.formData();
		const file = formData.get("file") as File | null;

		if (!file) {
			return c.json({ error: "No file provided" }, 400);
		}

		console.log(`[ObjectStore] Uploading file "${file.name}" (${file.size} bytes) to bucket "${bucketName}"`);

		// Use @nats-io/obj for Object Store operations
		const objm = new Objm(nc);
		const os = await objm.open(bucketName);

		// Read file as ArrayBuffer and convert to Uint8Array
		const arrayBuffer = await file.arrayBuffer();
		const data = new Uint8Array(arrayBuffer);

		console.log(`[ObjectStore] Data ready, ${data.length} bytes. Uploading...`);

		// Upload to object store using putBlob for Uint8Array data
		const info = await os.putBlob({ name: file.name }, data);

		console.log(`[ObjectStore] Upload complete:`, info.name);

		return c.json({
			success: true,
			name: info.name,
			size: info.size,
			chunks: info.chunks,
			digest: info.digest,
		});
	} catch (error) {
		console.error("Upload error:", error);
		return c.json({
			error: error instanceof Error ? error.message : "Failed to upload file",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

export default objectstore;
