import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
	getCluster,
	getAllClusters,
	createAlert,
	getAlert,
	getAlertsByCluster,
	getAllAlerts,
	updateAlert,
	deleteAlert,
	createAlertEvent,
	getAlertEvents,
	getRecentAlertEvents,
	type AlertMetric,
	type AlertCondition,
	type AlertEventStatus,
} from "../db";

// Types for NATS monitoring endpoints
export interface NatsVarz {
	server_id: string;
	server_name: string;
	version: string;
	proto: number;
	host: string;
	port: number;
	max_connections: number;
	ping_interval: number;
	ping_max: number;
	http_host: string;
	http_port: number;
	https_port: number;
	auth_timeout: number;
	max_control_line: number;
	max_payload: number;
	max_pending: number;
	cluster?: {
		name?: string;
		addr?: string;
		cluster_port?: number;
		auth_timeout?: number;
	};
	gateway?: {
		name?: string;
		host?: string;
		port?: number;
	};
	leaf?: {
		host?: string;
		port?: number;
	};
	tls_timeout: number;
	write_deadline: number;
	start: string;
	now: string;
	uptime: string;
	mem: number;
	cores: number;
	gomaxprocs: number;
	cpu: number;
	connections: number;
	total_connections: number;
	routes: number;
	remotes: number;
	leafnodes: number;
	in_msgs: number;
	out_msgs: number;
	in_bytes: number;
	out_bytes: number;
	slow_consumers: number;
	subscriptions: number;
	http_req_stats: Record<string, number>;
	config_load_time: string;
	jetstream?: {
		config?: {
			max_memory: number;
			max_storage: number;
			store_dir: string;
		};
		stats?: {
			memory: number;
			storage: number;
			reserved_memory: number;
			reserved_storage: number;
			accounts: number;
			api: {
				total: number;
				errors: number;
			};
		};
	};
}

export interface NatsConnzConnection {
	cid: number;
	kind: string;
	type: string;
	ip: string;
	port: number;
	start: string;
	last_activity: string;
	rtt: string;
	uptime: string;
	idle: string;
	pending_bytes: number;
	in_msgs: number;
	out_msgs: number;
	in_bytes: number;
	out_bytes: number;
	subscriptions: number;
	name?: string;
	lang?: string;
	version?: string;
	authorized_user?: string;
	account?: string;
}

export interface NatsConnz {
	server_id: string;
	now: string;
	num_connections: number;
	total: number;
	offset: number;
	limit: number;
	connections: NatsConnzConnection[];
}

export interface NatsSubsz {
	num_subscriptions: number;
	num_cache: number;
	num_inserts: number;
	num_removes: number;
	num_matches: number;
	cache_hit_rate: number;
	max_fanout: number;
	avg_fanout: number;
}

export interface NatsHealthz {
	status: string;
	error?: string;
}

// Zod schemas
const createAlertSchema = z.object({
	clusterId: z.string().min(1),
	name: z.string().min(1).max(100),
	metric: z.enum(["connections", "subscriptions", "slow_consumers", "in_msgs_rate", "out_msgs_rate"]),
	condition: z.enum(["gt", "lt", "gte", "lte"]),
	threshold: z.number(),
	enabled: z.boolean().default(true),
});

const updateAlertSchema = z.object({
	name: z.string().min(1).max(100).optional(),
	metric: z.enum(["connections", "subscriptions", "slow_consumers", "in_msgs_rate", "out_msgs_rate"]).optional(),
	condition: z.enum(["gt", "lt", "gte", "lte"]).optional(),
	threshold: z.number().optional(),
	enabled: z.boolean().optional(),
});

// Helper to fetch from NATS monitoring endpoint
async function fetchNatsMonitoring<T>(monitoringUrl: string, endpoint: string): Promise<T> {
	const url = `${monitoringUrl.replace(/\/$/, "")}${endpoint}`;
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch ${endpoint}: ${response.status} ${response.statusText}`);
	}

	return response.json() as Promise<T>;
}

// Helper to try multiple monitoring URLs and return first successful response
async function fetchFromAnyMonitoringUrl<T>(
	monitoringUrls: string[],
	endpoint: string,
): Promise<{ data: T; url: string }> {
	const errors: string[] = [];

	for (const url of monitoringUrls) {
		try {
			const data = await fetchNatsMonitoring<T>(url, endpoint);
			return { data, url };
		} catch (error) {
			errors.push(`${url}: ${error instanceof Error ? error.message : "Unknown error"}`);
		}
	}

	throw new Error(`All monitoring URLs failed:\n${errors.join("\n")}`);
}

// Helper to fetch from multiple URLs and return all results
async function fetchFromAllMonitoringUrls<T>(
	monitoringUrls: string[],
	endpoint: string,
): Promise<Array<{ data: T; url: string; error?: string }>> {
	const results = await Promise.allSettled(
		monitoringUrls.map(async (url) => {
			const data = await fetchNatsMonitoring<T>(url, endpoint);
			return { data, url };
		}),
	);

	return results.map((result, index) => {
		if (result.status === "fulfilled") {
			return result.value;
		}
		return {
			data: null as unknown as T,
			url: monitoringUrls[index],
			error: result.reason instanceof Error ? result.reason.message : "Unknown error",
		};
	});
}

// Aggregate varz from multiple servers
interface AggregatedVarz {
	servers: Array<{
		url: string;
		server_name: string;
		version: string;
		uptime: string;
		cpu: number;
		mem: number;
		connections: number;
		subscriptions: number;
		slow_consumers: number;
		in_msgs: number;
		out_msgs: number;
		in_bytes: number;
		out_bytes: number;
		error?: string;
	}>;
	totals: {
		connections: number;
		total_connections: number;
		subscriptions: number;
		slow_consumers: number;
		in_msgs: number;
		out_msgs: number;
		in_bytes: number;
		out_bytes: number;
		routes: number;
		remotes: number;
		leafnodes: number;
	};
	jetstream?: {
		memory: number;
		storage: number;
		reserved_memory: number;
		reserved_storage: number;
		accounts: number;
		api_total: number;
		api_errors: number;
	};
}

function aggregateVarz(results: Array<{ data: NatsVarz; url: string; error?: string }>): AggregatedVarz {
	const servers: AggregatedVarz["servers"] = [];
	const totals = {
		connections: 0,
		total_connections: 0,
		subscriptions: 0,
		slow_consumers: 0,
		in_msgs: 0,
		out_msgs: 0,
		in_bytes: 0,
		out_bytes: 0,
		routes: 0,
		remotes: 0,
		leafnodes: 0,
	};
	let jetstream: AggregatedVarz["jetstream"] | undefined;

	for (const result of results) {
		if (result.error || !result.data) {
			servers.push({
				url: result.url,
				server_name: "Unknown",
				version: "Unknown",
				uptime: "Unknown",
				cpu: 0,
				mem: 0,
				connections: 0,
				subscriptions: 0,
				slow_consumers: 0,
				in_msgs: 0,
				out_msgs: 0,
				in_bytes: 0,
				out_bytes: 0,
				error: result.error,
			});
			continue;
		}

		const v = result.data;
		servers.push({
			url: result.url,
			server_name: v.server_name,
			version: v.version,
			uptime: v.uptime,
			cpu: v.cpu,
			mem: v.mem,
			connections: v.connections,
			subscriptions: v.subscriptions,
			slow_consumers: v.slow_consumers,
			in_msgs: v.in_msgs,
			out_msgs: v.out_msgs,
			in_bytes: v.in_bytes,
			out_bytes: v.out_bytes,
		});

		totals.connections += v.connections;
		totals.total_connections += v.total_connections;
		totals.subscriptions += v.subscriptions;
		totals.slow_consumers += v.slow_consumers;
		totals.in_msgs += v.in_msgs;
		totals.out_msgs += v.out_msgs;
		totals.in_bytes += v.in_bytes;
		totals.out_bytes += v.out_bytes;
		totals.routes += v.routes;
		totals.remotes += v.remotes;
		totals.leafnodes += v.leafnodes;

		if (v.jetstream?.stats) {
			if (!jetstream) {
				jetstream = {
					memory: 0,
					storage: 0,
					reserved_memory: 0,
					reserved_storage: 0,
					accounts: 0,
					api_total: 0,
					api_errors: 0,
				};
			}
			jetstream.memory += v.jetstream.stats.memory;
			jetstream.storage += v.jetstream.stats.storage;
			jetstream.reserved_memory += v.jetstream.stats.reserved_memory;
			jetstream.reserved_storage += v.jetstream.stats.reserved_storage;
			jetstream.accounts = Math.max(jetstream.accounts, v.jetstream.stats.accounts);
			jetstream.api_total += v.jetstream.stats.api.total;
			jetstream.api_errors += v.jetstream.stats.api.errors;
		}
	}

	return { servers, totals, jetstream };
}

// Aggregate connz from multiple servers
interface AggregatedConnz {
	servers: Array<{
		url: string;
		num_connections: number;
		error?: string;
	}>;
	total_connections: number;
	connections: Array<NatsConnzConnection & { server_url: string }>;
}

function aggregateConnz(results: Array<{ data: NatsConnz; url: string; error?: string }>): AggregatedConnz {
	const servers: AggregatedConnz["servers"] = [];
	const connections: AggregatedConnz["connections"] = [];
	let total = 0;

	for (const result of results) {
		if (result.error || !result.data) {
			servers.push({
				url: result.url,
				num_connections: 0,
				error: result.error,
			});
			continue;
		}

		servers.push({
			url: result.url,
			num_connections: result.data.num_connections,
		});

		total += result.data.num_connections;

		for (const conn of result.data.connections || []) {
			connections.push({
				...conn,
				server_url: result.url,
			});
		}
	}

	// Sort by CID
	connections.sort((a, b) => a.cid - b.cid);

	return { servers, total_connections: total, connections };
}

// Aggregate subsz from multiple servers
interface AggregatedSubsz {
	servers: Array<{
		url: string;
		num_subscriptions: number;
		num_cache: number;
		cache_hit_rate: number;
		error?: string;
	}>;
	totals: {
		num_subscriptions: number;
		num_cache: number;
		num_inserts: number;
		num_removes: number;
		num_matches: number;
		max_fanout: number;
		avg_fanout: number;
	};
}

function aggregateSubsz(results: Array<{ data: NatsSubsz; url: string; error?: string }>): AggregatedSubsz {
	const servers: AggregatedSubsz["servers"] = [];
	const totals = {
		num_subscriptions: 0,
		num_cache: 0,
		num_inserts: 0,
		num_removes: 0,
		num_matches: 0,
		max_fanout: 0,
		avg_fanout: 0,
	};
	let fanoutSum = 0;
	let fanoutCount = 0;

	for (const result of results) {
		if (result.error || !result.data) {
			servers.push({
				url: result.url,
				num_subscriptions: 0,
				num_cache: 0,
				cache_hit_rate: 0,
				error: result.error,
			});
			continue;
		}

		const s = result.data;
		servers.push({
			url: result.url,
			num_subscriptions: s.num_subscriptions,
			num_cache: s.num_cache,
			cache_hit_rate: s.cache_hit_rate,
		});

		totals.num_subscriptions += s.num_subscriptions;
		totals.num_cache += s.num_cache;
		totals.num_inserts += s.num_inserts;
		totals.num_removes += s.num_removes;
		totals.num_matches += s.num_matches;
		totals.max_fanout = Math.max(totals.max_fanout, s.max_fanout);
		fanoutSum += s.avg_fanout;
		fanoutCount++;
	}

	totals.avg_fanout = fanoutCount > 0 ? fanoutSum / fanoutCount : 0;

	return { servers, totals };
}

// Aggregate health from multiple servers
interface AggregatedHealth {
	servers: Array<{
		url: string;
		status: string;
		error?: string;
	}>;
	overall_status: "ok" | "degraded" | "error";
	healthy_count: number;
	total_count: number;
}

function aggregateHealth(results: Array<{ data: NatsHealthz; url: string; error?: string }>): AggregatedHealth {
	const servers: AggregatedHealth["servers"] = [];
	let healthyCount = 0;

	for (const result of results) {
		if (result.error || !result.data) {
			servers.push({
				url: result.url,
				status: "error",
				error: result.error,
			});
			continue;
		}

		servers.push({
			url: result.url,
			status: result.data.status,
			error: result.data.error,
		});

		if (result.data.status === "ok") {
			healthyCount++;
		}
	}

	let overall_status: AggregatedHealth["overall_status"] = "ok";
	if (healthyCount === 0) {
		overall_status = "error";
	} else if (healthyCount < servers.length) {
		overall_status = "degraded";
	}

	return {
		servers,
		overall_status,
		healthy_count: healthyCount,
		total_count: servers.length,
	};
}

// Helper to check if an alert condition is triggered
function isAlertTriggered(
	value: number,
	condition: AlertCondition,
	threshold: number,
): boolean {
	switch (condition) {
		case "gt":
			return value > threshold;
		case "lt":
			return value < threshold;
		case "gte":
			return value >= threshold;
		case "lte":
			return value <= threshold;
		default:
			return false;
	}
}

// Helper to get metric value from varz
function getMetricValue(varz: NatsVarz, metric: AlertMetric): number {
	switch (metric) {
		case "connections":
			return varz.connections;
		case "subscriptions":
			return varz.subscriptions;
		case "slow_consumers":
			return varz.slow_consumers;
		case "in_msgs_rate":
			return varz.in_msgs;
		case "out_msgs_rate":
			return varz.out_msgs;
		default:
			return 0;
	}
}

const monitoring = new Hono();

// Helper to get selected URLs from query param or return all
function getSelectedUrls(allUrls: string[], urlsParam: string | undefined): string[] {
	if (!urlsParam) {
		return allUrls; // Default: fetch from all
	}
	const selectedUrls = urlsParam.split(",").map((u) => u.trim());
	// Filter to only valid URLs from the cluster's monitoring URLs
	return selectedUrls.filter((u) => allUrls.includes(u));
}

// Get varz (server variables/stats) - aggregated from selected servers
monitoring.get("/cluster/:id/varz", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) {
		return c.json({ error: "Monitoring URLs not configured for this cluster" }, 400);
	}

	const selectedUrls = getSelectedUrls(cluster.monitoring_urls, c.req.query("urls"));
	if (selectedUrls.length === 0) {
		return c.json({ error: "No valid monitoring URLs selected" }, 400);
	}

	try {
		const results = await fetchFromAllMonitoringUrls<NatsVarz>(selectedUrls, "/varz");
		const aggregated = aggregateVarz(results);
		return c.json(aggregated);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to fetch varz",
		}, 500);
	}
});

// Get connz (connections) - aggregated from selected servers
monitoring.get("/cluster/:id/connz", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) {
		return c.json({ error: "Monitoring URLs not configured for this cluster" }, 400);
	}

	const selectedUrls = getSelectedUrls(cluster.monitoring_urls, c.req.query("urls"));
	if (selectedUrls.length === 0) {
		return c.json({ error: "No valid monitoring URLs selected" }, 400);
	}

	try {
		// Fetch from all selected servers with high limit
		const results = await fetchFromAllMonitoringUrls<NatsConnz>(
			selectedUrls,
			"/connz?limit=1024",
		);
		const aggregated = aggregateConnz(results);
		return c.json(aggregated);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to fetch connz",
		}, 500);
	}
});

// Get subsz (subscriptions) - aggregated from selected servers
monitoring.get("/cluster/:id/subsz", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) {
		return c.json({ error: "Monitoring URLs not configured for this cluster" }, 400);
	}

	const selectedUrls = getSelectedUrls(cluster.monitoring_urls, c.req.query("urls"));
	if (selectedUrls.length === 0) {
		return c.json({ error: "No valid monitoring URLs selected" }, 400);
	}

	try {
		const results = await fetchFromAllMonitoringUrls<NatsSubsz>(selectedUrls, "/subsz");
		const aggregated = aggregateSubsz(results);
		return c.json(aggregated);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to fetch subsz",
		}, 500);
	}
});

// Get health check - aggregated from all servers
monitoring.get("/cluster/:id/health", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) {
		return c.json({ error: "Monitoring URLs not configured for this cluster" }, 400);
	}

	const selectedUrls = getSelectedUrls(cluster.monitoring_urls, c.req.query("urls"));
	if (selectedUrls.length === 0) {
		return c.json({ error: "No valid monitoring URLs selected" }, 400);
	}

	try {
		const results = await fetchFromAllMonitoringUrls<NatsHealthz>(selectedUrls, "/healthz");
		const aggregated = aggregateHealth(results);
		return c.json(aggregated);
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to fetch health",
			overall_status: "error",
		}, 500);
	}
});

// Get clusters with monitoring enabled
monitoring.get("/clusters", (c) => {
	const clusters = getAllClusters();
	const monitoringClusters = clusters
		.filter((cluster) => cluster.monitoring_urls && cluster.monitoring_urls.length > 0)
		.map((cluster) => ({
			id: cluster.id,
			name: cluster.name,
			monitoringUrls: cluster.monitoring_urls,
		}));
	return c.json(monitoringClusters);
});

// ===== ALERTS CRUD =====

// Get all alerts
monitoring.get("/alerts", (c) => {
	const clusterId = c.req.query("clusterId");
	const alerts = clusterId ? getAlertsByCluster(clusterId) : getAllAlerts();
	return c.json(alerts);
});

// Get single alert
monitoring.get("/alerts/:id", (c) => {
	const id = c.req.param("id");
	const alert = getAlert(id);

	if (!alert) {
		return c.json({ error: "Alert not found" }, 404);
	}

	return c.json(alert);
});

// Create alert
monitoring.post("/alerts", zValidator("json", createAlertSchema), (c) => {
	const { clusterId, name, metric, condition, threshold, enabled } = c.req.valid("json");

	// Verify cluster exists
	const cluster = getCluster(clusterId);
	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	const alert = createAlert(
		clusterId,
		name,
		metric as AlertMetric,
		condition as AlertCondition,
		threshold,
		enabled,
	);

	return c.json(alert, 201);
});

// Update alert
monitoring.patch("/alerts/:id", zValidator("json", updateAlertSchema), (c) => {
	const id = c.req.param("id");
	const data = c.req.valid("json");

	const updated = updateAlert(id, {
		name: data.name,
		metric: data.metric as AlertMetric | undefined,
		condition: data.condition as AlertCondition | undefined,
		threshold: data.threshold,
		enabled: data.enabled,
	});

	if (!updated) {
		return c.json({ error: "Alert not found" }, 404);
	}

	return c.json(updated);
});

// Delete alert
monitoring.delete("/alerts/:id", (c) => {
	const id = c.req.param("id");
	const deleted = deleteAlert(id);

	if (!deleted) {
		return c.json({ error: "Alert not found" }, 404);
	}

	return c.json({ success: true });
});

// Get alert events
monitoring.get("/alerts/:id/events", (c) => {
	const id = c.req.param("id");
	const limit = Number.parseInt(c.req.query("limit") || "50", 10);

	const alert = getAlert(id);
	if (!alert) {
		return c.json({ error: "Alert not found" }, 404);
	}

	const events = getAlertEvents(id, limit);
	return c.json(events);
});

// Get recent alert events (across all alerts)
monitoring.get("/events/recent", (c) => {
	const limit = Number.parseInt(c.req.query("limit") || "100", 10);
	const events = getRecentAlertEvents(limit);
	return c.json(events);
});

// Helper to get metric value from aggregated varz totals
function getAggregatedMetricValue(totals: AggregatedVarz["totals"], metric: AlertMetric): number {
	switch (metric) {
		case "connections":
			return totals.connections;
		case "subscriptions":
			return totals.subscriptions;
		case "slow_consumers":
			return totals.slow_consumers;
		case "in_msgs_rate":
			return totals.in_msgs;
		case "out_msgs_rate":
			return totals.out_msgs;
		default:
			return 0;
	}
}

// Check alerts for a cluster (triggers alert evaluation using aggregated stats)
monitoring.post("/cluster/:id/check-alerts", async (c) => {
	const id = c.req.param("id");
	const cluster = getCluster(id);

	if (!cluster) {
		return c.json({ error: "Cluster not found" }, 404);
	}

	if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) {
		return c.json({ error: "Monitoring URLs not configured for this cluster" }, 400);
	}

	try {
		// Fetch from all servers and aggregate
		const results = await fetchFromAllMonitoringUrls<NatsVarz>(cluster.monitoring_urls, "/varz");
		const aggregated = aggregateVarz(results);
		const alerts = getAlertsByCluster(id);
		const triggeredAlerts: Array<{ alert: ReturnType<typeof getAlert>; value: number }> = [];

		for (const alert of alerts) {
			if (!alert.enabled) continue;

			const value = getAggregatedMetricValue(aggregated.totals, alert.metric);
			const triggered = isAlertTriggered(value, alert.condition, alert.threshold);

			if (triggered) {
				const conditionText = {
					gt: ">",
					lt: "<",
					gte: ">=",
					lte: "<=",
				}[alert.condition];

				createAlertEvent(
					alert.id,
					"triggered" as AlertEventStatus,
					value,
					`${alert.metric} ${conditionText} ${alert.threshold} (current: ${value})`,
				);
				triggeredAlerts.push({ alert, value });
			}
		}

		return c.json({
			checked: alerts.length,
			triggered: triggeredAlerts.length,
			triggeredAlerts: triggeredAlerts.map((t) => ({
				alertId: t.alert?.id,
				alertName: t.alert?.name,
				value: t.value,
			})),
		});
	} catch (error) {
		return c.json({
			error: error instanceof Error ? error.message : "Failed to check alerts",
		}, 500);
	}
});

export default monitoring;
