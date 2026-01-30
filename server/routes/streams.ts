import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	connect,
	type NatsConnection,
	type ConnectionOptions,
	type StreamInfo,
	type StreamConfig,
	StorageType,
	RetentionPolicy,
	DiscardPolicy,
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

// Format stream info for response
function formatStreamInfo(info: StreamInfo) {
	return {
		name: info.config.name,
		description: info.config.description,
		subjects: info.config.subjects,
		retention: info.config.retention,
		maxConsumers: info.config.max_consumers,
		maxMsgs: info.config.max_msgs,
		maxBytes: info.config.max_bytes,
		maxAge: info.config.max_age,
		maxMsgSize: info.config.max_msg_size,
		storage: info.config.storage,
		replicas: info.config.num_replicas,
		discard: info.config.discard,
		duplicateWindow: info.config.duplicate_window,
		state: {
			messages: info.state.messages,
			bytes: info.state.bytes,
			firstSeq: info.state.first_seq,
			lastSeq: info.state.last_seq,
			consumerCount: info.state.consumer_count,
			firstTs: info.state.first_ts,
			lastTs: info.state.last_ts,
		},
		created: info.created,
	};
}

// Zod schemas
const createStreamSchema = z.object({
	name: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores, and hyphens"),
	description: z.string().max(4096).optional(),
	subjects: z.array(z.string().min(1)).min(1),
	retention: z.enum(["limits", "interest", "workqueue"]).default("limits"),
	storage: z.enum(["file", "memory"]).default("file"),
	maxConsumers: z.number().int().min(-1).default(-1),
	maxMsgs: z.number().int().min(-1).default(-1),
	maxBytes: z.number().int().min(-1).default(-1),
	maxAge: z.number().int().min(0).default(0), // nanoseconds
	maxMsgSize: z.number().int().min(-1).default(-1),
	replicas: z.number().int().min(1).max(5).default(1),
	discard: z.enum(["old", "new"]).default("old"),
});

const updateStreamSchema = z.object({
	description: z.string().max(4096).optional(),
	subjects: z.array(z.string().min(1)).min(1).optional(),
	maxConsumers: z.number().int().min(-1).optional(),
	maxMsgs: z.number().int().min(-1).optional(),
	maxBytes: z.number().int().min(-1).optional(),
	maxAge: z.number().int().min(0).optional(),
	maxMsgSize: z.number().int().min(-1).optional(),
	discard: z.enum(["old", "new"]).optional(),
});

const streams = new Hono();

// List all streams for a cluster
streams.get("/cluster/:clusterId", async (c) => {
	const clusterId = c.req.param("clusterId");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const allStreams: StreamInfo[] = [];

		// Iterate through all streams
		for await (const stream of jsm.streams.list()) {
			// Filter out KV and Object Store backing streams
			if (!stream.config.name.startsWith("KV_") && !stream.config.name.startsWith("OBJ_")) {
				allStreams.push(stream);
			}
		}

		const formatted = allStreams.map(formatStreamInfo);
		return c.json(formatted);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to list streams",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get a single stream
streams.get("/cluster/:clusterId/stream/:name", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const info = await jsm.streams.info(name);
		return c.json(formatStreamInfo(info));
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Stream not found",
		}, 404);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Create a new stream
streams.post("/cluster/:clusterId", zValidator("json", createStreamSchema), async (c) => {
	const clusterId = c.req.param("clusterId");
	const data = c.req.valid("json");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();

		const config: Partial<StreamConfig> = {
			name: data.name,
			description: data.description,
			subjects: data.subjects,
			retention: data.retention === "limits" ? RetentionPolicy.Limits :
				data.retention === "interest" ? RetentionPolicy.Interest :
				RetentionPolicy.Workqueue,
			storage: data.storage === "file" ? StorageType.File : StorageType.Memory,
			max_consumers: data.maxConsumers,
			max_msgs: data.maxMsgs,
			max_bytes: data.maxBytes,
			max_age: data.maxAge,
			max_msg_size: data.maxMsgSize,
			num_replicas: data.replicas,
			discard: data.discard === "old" ? DiscardPolicy.Old : DiscardPolicy.New,
		};

		const info = await jsm.streams.add(config);
		return c.json(formatStreamInfo(info), 201);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to create stream",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Update a stream
streams.patch("/cluster/:clusterId/stream/:name", zValidator("json", updateStreamSchema), async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const data = c.req.valid("json");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();

		// Get existing config
		const existing = await jsm.streams.info(name);
		const config: Partial<StreamConfig> = { ...existing.config };

		// Update fields
		if (data.description !== undefined) config.description = data.description;
		if (data.subjects !== undefined) config.subjects = data.subjects;
		if (data.maxConsumers !== undefined) config.max_consumers = data.maxConsumers;
		if (data.maxMsgs !== undefined) config.max_msgs = data.maxMsgs;
		if (data.maxBytes !== undefined) config.max_bytes = data.maxBytes;
		if (data.maxAge !== undefined) config.max_age = data.maxAge;
		if (data.maxMsgSize !== undefined) config.max_msg_size = data.maxMsgSize;
		if (data.discard !== undefined) {
			config.discard = data.discard === "old" ? DiscardPolicy.Old : DiscardPolicy.New;
		}

		const info = await jsm.streams.update(name, config);
		return c.json(formatStreamInfo(info));
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to update stream",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Delete a stream
streams.delete("/cluster/:clusterId/stream/:name", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		await jsm.streams.delete(name);
		return c.json({ success: true });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to delete stream",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Purge a stream
streams.post("/cluster/:clusterId/stream/:name/purge", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const purged = await jsm.streams.purge(name);
		return c.json({ success: true, purged: purged.purged });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to purge stream",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get messages from a stream
streams.get("/cluster/:clusterId/stream/:name/messages", async (c) => {
	const clusterId = c.req.param("clusterId");
	const name = c.req.param("name");
	const startSeq = Number(c.req.query("startSeq")) || 1;
	const limit = Math.min(Number(c.req.query("limit")) || 50, 100);

	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();

		// Get stream info to know the range
		const info = await jsm.streams.info(name);
		const firstSeq = info.state.first_seq;
		const lastSeq = info.state.last_seq;

		// Adjust startSeq if needed
		const actualStart = Math.max(startSeq, firstSeq);

		if (actualStart > lastSeq) {
			return c.json({
				messages: [],
				firstSeq,
				lastSeq,
				hasMore: false,
			});
		}

		const messages: Array<{
			seq: number;
			subject: string;
			data: string;
			time: string;
			headers?: Record<string, string[]>;
		}> = [];

		// Use direct message access to fetch messages by sequence
		for (let seq = actualStart; seq <= lastSeq && messages.length < limit; seq++) {
			try {
				const msg = await jsm.streams.getMessage(name, { seq });
				messages.push({
					seq: msg.seq,
					subject: msg.subject,
					data: new TextDecoder().decode(msg.data),
					time: msg.time.toISOString(),
					headers: msg.header
						? Object.fromEntries(
								Array.from(msg.header.keys()).map((k) => [k, msg.header!.values(k)])
							)
						: undefined,
				});
			} catch {
				// Message may have been deleted, skip it
				continue;
			}
		}

		return c.json({
			messages,
			firstSeq,
			lastSeq,
			hasMore: messages.length > 0 && messages[messages.length - 1].seq < lastSeq,
		});
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to fetch messages",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

export default streams;
