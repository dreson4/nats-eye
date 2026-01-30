import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
	connect,
	type NatsConnection,
	type ConnectionOptions,
	type ConsumerInfo,
	type ConsumerConfig,
	AckPolicy,
	DeliverPolicy,
	ReplayPolicy,
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

// Format consumer info for response
function formatConsumerInfo(streamName: string, info: ConsumerInfo) {
	return {
		stream: streamName,
		name: info.name,
		created: info.created,
		config: {
			durableName: info.config.durable_name,
			description: info.config.description,
			deliverPolicy: info.config.deliver_policy,
			optStartSeq: info.config.opt_start_seq,
			optStartTime: info.config.opt_start_time,
			ackPolicy: info.config.ack_policy,
			ackWait: info.config.ack_wait,
			maxDeliver: info.config.max_deliver,
			filterSubject: info.config.filter_subject,
			filterSubjects: info.config.filter_subjects,
			replayPolicy: info.config.replay_policy,
			sampleFreq: info.config.sample_freq,
			maxWaiting: info.config.max_waiting,
			maxAckPending: info.config.max_ack_pending,
			flowControl: info.config.flow_control,
			idleHeartbeat: info.config.idle_heartbeat,
			headersOnly: info.config.headers_only,
			maxBatch: info.config.max_batch,
			maxBytes: info.config.max_bytes,
			numReplicas: info.config.num_replicas,
			memStorage: info.config.mem_storage,
		},
		delivered: {
			consumerSeq: info.delivered.consumer_seq,
			streamSeq: info.delivered.stream_seq,
		},
		ackFloor: {
			consumerSeq: info.ack_floor.consumer_seq,
			streamSeq: info.ack_floor.stream_seq,
		},
		numAckPending: info.num_ack_pending,
		numRedelivered: info.num_redelivered,
		numWaiting: info.num_waiting,
		numPending: info.num_pending,
		pushBound: info.push_bound,
	};
}

// Zod schemas
const createConsumerSchema = z.object({
	name: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, underscores, and hyphens"),
	description: z.string().max(4096).optional(),
	durableName: z.string().min(1).max(256).regex(/^[a-zA-Z0-9_-]+$/).optional(),
	deliverPolicy: z.enum(["all", "last", "new", "by_start_sequence", "by_start_time", "last_per_subject"]).default("all"),
	optStartSeq: z.number().int().min(0).optional(),
	optStartTime: z.string().optional(),
	ackPolicy: z.enum(["none", "all", "explicit"]).default("explicit"),
	ackWait: z.number().int().min(0).optional(), // nanoseconds
	maxDeliver: z.number().int().min(-1).default(-1),
	filterSubject: z.string().optional(),
	filterSubjects: z.array(z.string()).optional(),
	replayPolicy: z.enum(["instant", "original"]).default("instant"),
	maxWaiting: z.number().int().min(0).optional(),
	maxAckPending: z.number().int().min(0).optional(),
	flowControl: z.boolean().optional(),
	headersOnly: z.boolean().optional(),
	maxBatch: z.number().int().min(0).optional(),
	maxBytes: z.number().int().min(0).optional(),
});

const consumers = new Hono();

// List all consumers for a stream
consumers.get("/cluster/:clusterId/stream/:streamName", async (c) => {
	const clusterId = c.req.param("clusterId");
	const streamName = c.req.param("streamName");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const allConsumers: ReturnType<typeof formatConsumerInfo>[] = [];

		// Iterate through all consumers for this stream
		for await (const consumer of jsm.consumers.list(streamName)) {
			allConsumers.push(formatConsumerInfo(streamName, consumer));
		}

		return c.json(allConsumers);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to list consumers",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// List all consumers across all streams in a cluster
consumers.get("/cluster/:clusterId", async (c) => {
	const clusterId = c.req.param("clusterId");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const allConsumers: ReturnType<typeof formatConsumerInfo>[] = [];

		// Iterate through all streams
		for await (const stream of jsm.streams.list()) {
			// Skip KV and Object Store backing streams
			if (stream.config.name.startsWith("KV_") || stream.config.name.startsWith("OBJ_")) {
				continue;
			}

			// Get consumers for this stream
			for await (const consumer of jsm.consumers.list(stream.config.name)) {
				allConsumers.push(formatConsumerInfo(stream.config.name, consumer));
			}
		}

		return c.json(allConsumers);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to list consumers",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Get a single consumer
consumers.get("/cluster/:clusterId/stream/:streamName/consumer/:consumerName", async (c) => {
	const clusterId = c.req.param("clusterId");
	const streamName = c.req.param("streamName");
	const consumerName = c.req.param("consumerName");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		const info = await jsm.consumers.info(streamName, consumerName);
		return c.json(formatConsumerInfo(streamName, info));
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Consumer not found",
		}, 404);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Create a new consumer
consumers.post("/cluster/:clusterId/stream/:streamName", zValidator("json", createConsumerSchema), async (c) => {
	const clusterId = c.req.param("clusterId");
	const streamName = c.req.param("streamName");
	const data = c.req.valid("json");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();

		// Map deliver policy
		let deliverPolicy: DeliverPolicy;
		switch (data.deliverPolicy) {
			case "all": deliverPolicy = DeliverPolicy.All; break;
			case "last": deliverPolicy = DeliverPolicy.Last; break;
			case "new": deliverPolicy = DeliverPolicy.New; break;
			case "by_start_sequence": deliverPolicy = DeliverPolicy.StartSequence; break;
			case "by_start_time": deliverPolicy = DeliverPolicy.StartTime; break;
			case "last_per_subject": deliverPolicy = DeliverPolicy.LastPerSubject; break;
			default: deliverPolicy = DeliverPolicy.All;
		}

		// Map ack policy
		let ackPolicy: AckPolicy;
		switch (data.ackPolicy) {
			case "none": ackPolicy = AckPolicy.None; break;
			case "all": ackPolicy = AckPolicy.All; break;
			case "explicit": ackPolicy = AckPolicy.Explicit; break;
			default: ackPolicy = AckPolicy.Explicit;
		}

		// Map replay policy
		let replayPolicy: ReplayPolicy;
		switch (data.replayPolicy) {
			case "instant": replayPolicy = ReplayPolicy.Instant; break;
			case "original": replayPolicy = ReplayPolicy.Original; break;
			default: replayPolicy = ReplayPolicy.Instant;
		}

		const config: Partial<ConsumerConfig> = {
			name: data.name,
			durable_name: data.durableName || data.name,
			description: data.description,
			deliver_policy: deliverPolicy,
			ack_policy: ackPolicy,
			replay_policy: replayPolicy,
			max_deliver: data.maxDeliver,
			filter_subject: data.filterSubject,
			filter_subjects: data.filterSubjects,
			max_waiting: data.maxWaiting,
			max_ack_pending: data.maxAckPending,
			flow_control: data.flowControl,
			headers_only: data.headersOnly,
			max_batch: data.maxBatch,
			max_bytes: data.maxBytes,
		};

		if (data.optStartSeq !== undefined) {
			config.opt_start_seq = data.optStartSeq;
		}
		if (data.optStartTime !== undefined) {
			config.opt_start_time = data.optStartTime;
		}
		if (data.ackWait !== undefined) {
			config.ack_wait = data.ackWait;
		}

		const info = await jsm.consumers.add(streamName, config);
		return c.json(formatConsumerInfo(streamName, info), 201);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to create consumer",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

// Delete a consumer
consumers.delete("/cluster/:clusterId/stream/:streamName/consumer/:consumerName", async (c) => {
	const clusterId = c.req.param("clusterId");
	const streamName = c.req.param("streamName");
	const consumerName = c.req.param("consumerName");
	const result = await connectToCluster(clusterId);

	if ("error" in result) {
		return c.json({ error: result.error }, 400);
	}

	const { nc } = result;

	try {
		const jsm = await nc.jetstreamManager();
		await jsm.consumers.delete(streamName, consumerName);
		return c.json({ success: true });
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to delete consumer",
		}, 500);
	} finally {
		await nc.close().catch(() => {});
	}
});

export default consumers;
