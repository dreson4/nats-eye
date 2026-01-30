import { Hono } from "hono";
import { connect, type NatsConnection, type ConnectionOptions } from "nats.ws";
import { type AuthType, getAllClusters, getCluster } from "../db";

interface ClusterStats {
	id: string;
	name: string;
	connected: boolean;
	error?: string;
	serverInfo?: {
		serverName: string;
		version: string;
		jetstream: boolean;
		connections: number;
		subscriptions: number;
		slowConsumers: number;
		messagesIn: number;
		messagesOut: number;
		bytesIn: number;
		bytesOut: number;
	};
	jetstream?: {
		streams: number;
		consumers: number;
		messages: number;
		bytes: number;
	};
}

interface DashboardStats {
	clusters: {
		total: number;
		connected: number;
		disconnected: number;
	};
	totals: {
		streams: number;
		consumers: number;
		kvBuckets: number;
		messages: number;
		bytes: number;
	};
	clusterStats: ClusterStats[];
}

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

// Fetch stats for a single cluster
async function fetchClusterStats(cluster: ReturnType<typeof getCluster>): Promise<ClusterStats> {
	if (!cluster) {
		return {
			id: "",
			name: "Unknown",
			connected: false,
			error: "Cluster not found",
		};
	}

	let nc: NatsConnection | null = null;

	try {
		const opts = buildConnectionOptions(
			cluster.urls,
			cluster.auth_type,
			cluster.token,
			cluster.username,
			cluster.password,
		);
		nc = await connect(opts);

		const info = nc.info;
		const stats: ClusterStats = {
			id: cluster.id,
			name: cluster.name,
			connected: true,
			serverInfo: info
				? {
						serverName: info.server_name,
						version: info.version,
						jetstream: info.jetstream ?? false,
						connections: info.connect_urls?.length ?? 1,
						subscriptions: 0,
						slowConsumers: 0,
						messagesIn: 0,
						messagesOut: 0,
						bytesIn: 0,
						bytesOut: 0,
					}
				: undefined,
		};

		// If JetStream is enabled, get JetStream stats
		if (info?.jetstream) {
			try {
				const jsm = await nc.jetstreamManager();
				const streams = await jsm.streams.list().next();

				let totalConsumers = 0;
				let totalMessages = 0;
				let totalBytes = 0;

				for (const stream of streams) {
					totalConsumers += stream.state.consumer_count;
					totalMessages += stream.state.messages;
					totalBytes += stream.state.bytes;
				}

				stats.jetstream = {
					streams: streams.length,
					consumers: totalConsumers,
					messages: totalMessages,
					bytes: totalBytes,
				};
			} catch {
				// JetStream might not be fully available
				stats.jetstream = {
					streams: 0,
					consumers: 0,
					messages: 0,
					bytes: 0,
				};
			}
		}

		return stats;
	} catch (error) {
		return {
			id: cluster.id,
			name: cluster.name,
			connected: false,
			error: error instanceof Error ? error.message : "Connection failed",
		};
	} finally {
		if (nc) {
			await nc.close().catch(() => {});
		}
	}
}

const stats = new Hono();

// Get dashboard stats (all clusters)
stats.get("/dashboard", async (c) => {
	const clusters = getAllClusters();

	if (clusters.length === 0) {
		const emptyStats: DashboardStats = {
			clusters: { total: 0, connected: 0, disconnected: 0 },
			totals: { streams: 0, consumers: 0, kvBuckets: 0, messages: 0, bytes: 0 },
			clusterStats: [],
		};
		return c.json(emptyStats);
	}

	// Fetch stats for all clusters in parallel
	const clusterStats = await Promise.all(
		clusters.map((cluster) => fetchClusterStats(cluster)),
	);

	const connectedCount = clusterStats.filter((s) => s.connected).length;

	const totals = clusterStats.reduce(
		(acc, s) => {
			if (s.jetstream) {
				acc.streams += s.jetstream.streams;
				acc.consumers += s.jetstream.consumers;
				acc.messages += s.jetstream.messages;
				acc.bytes += s.jetstream.bytes;
			}
			return acc;
		},
		{ streams: 0, consumers: 0, kvBuckets: 0, messages: 0, bytes: 0 },
	);

	const dashboardStats: DashboardStats = {
		clusters: {
			total: clusters.length,
			connected: connectedCount,
			disconnected: clusters.length - connectedCount,
		},
		totals,
		clusterStats,
	};

	return c.json(dashboardStats);
});

// Get stats for a single cluster
stats.get("/cluster/:id", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	const clusterStats = await fetchClusterStats(cluster);
	return c.json(clusterStats);
});

export default stats;
