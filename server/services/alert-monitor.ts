import {
	type Alert,
	type AlertCondition,
	type AlertEventStatus,
	createAlertEvent,
	getAllAlerts,
	getAllClusters,
	getEnabledNotificationChannels,
	getSetting,
	setSetting,
	type NotificationChannel,
	type TelegramConfig,
	type DiscordConfig,
	type WebhookConfig,
	type SlackConfig,
} from "../db";

// Store last triggered state to avoid duplicate notifications
const lastTriggeredState = new Map<string, boolean>();

// Check interval in milliseconds (default: 30 seconds)
const DEFAULT_CHECK_INTERVAL = 30000;

let checkInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Types for NATS monitoring responses
interface NatsVarz {
	server_name: string;
	version: string;
	uptime: string;
	cpu: number;
	mem: number;
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
}

interface AggregatedTotals {
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
}

// Fetch varz from a monitoring URL
async function fetchVarz(url: string): Promise<NatsVarz | null> {
	try {
		const response = await fetch(`${url}/varz`, {
			signal: AbortSignal.timeout(5000),
		});
		if (!response.ok) return null;
		return await response.json();
	} catch {
		return null;
	}
}

// Aggregate varz from multiple servers
async function getAggregatedVarz(monitoringUrls: string[]): Promise<AggregatedTotals | null> {
	const results = await Promise.all(monitoringUrls.map(fetchVarz));
	const validResults = results.filter((r): r is NatsVarz => r !== null);

	if (validResults.length === 0) return null;

	return {
		connections: validResults.reduce((sum, r) => sum + r.connections, 0),
		total_connections: validResults.reduce((sum, r) => sum + r.total_connections, 0),
		subscriptions: validResults.reduce((sum, r) => sum + r.subscriptions, 0),
		slow_consumers: validResults.reduce((sum, r) => sum + r.slow_consumers, 0),
		in_msgs: validResults.reduce((sum, r) => sum + r.in_msgs, 0),
		out_msgs: validResults.reduce((sum, r) => sum + r.out_msgs, 0),
		in_bytes: validResults.reduce((sum, r) => sum + r.in_bytes, 0),
		out_bytes: validResults.reduce((sum, r) => sum + r.out_bytes, 0),
		routes: validResults.reduce((sum, r) => sum + r.routes, 0),
		remotes: validResults.reduce((sum, r) => sum + r.remotes, 0),
		leafnodes: validResults.reduce((sum, r) => sum + r.leafnodes, 0),
	};
}

// Get metric value from aggregated totals
function getMetricValue(totals: AggregatedTotals, metric: string): number {
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

// Check if alert condition is triggered
function isAlertTriggered(value: number, condition: AlertCondition, threshold: number): boolean {
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

// Send notification to Telegram
async function sendTelegramNotification(config: TelegramConfig, message: string): Promise<boolean> {
	try {
		const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: config.chatId,
				text: message,
				parse_mode: "HTML",
			}),
		});
		return response.ok;
	} catch (error) {
		console.error("[AlertMonitor] Telegram notification failed:", error);
		return false;
	}
}

// Send notification to Discord
async function sendDiscordNotification(config: DiscordConfig, message: string, isAlert: boolean): Promise<boolean> {
	try {
		const response = await fetch(config.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				embeds: [{
					title: isAlert ? "Alert Triggered" : "Alert Resolved",
					description: message,
					color: isAlert ? 0xff0000 : 0x00ff00,
					timestamp: new Date().toISOString(),
				}],
			}),
		});
		return response.ok;
	} catch (error) {
		console.error("[AlertMonitor] Discord notification failed:", error);
		return false;
	}
}

// Send notification to Slack
async function sendSlackNotification(config: SlackConfig, message: string, isAlert: boolean): Promise<boolean> {
	try {
		const response = await fetch(config.webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				attachments: [{
					color: isAlert ? "#ff0000" : "#00ff00",
					title: isAlert ? "Alert Triggered" : "Alert Resolved",
					text: message,
					ts: Math.floor(Date.now() / 1000),
				}],
			}),
		});
		return response.ok;
	} catch (error) {
		console.error("[AlertMonitor] Slack notification failed:", error);
		return false;
	}
}

// Send notification to webhook
async function sendWebhookNotification(
	config: WebhookConfig,
	alert: Alert,
	value: number,
	clusterName: string,
	isTriggered: boolean,
): Promise<boolean> {
	try {
		const payload = {
			alert: {
				id: alert.id,
				name: alert.name,
				metric: alert.metric,
				condition: alert.condition,
				threshold: alert.threshold,
			},
			cluster: clusterName,
			value,
			status: isTriggered ? "triggered" : "resolved",
			timestamp: new Date().toISOString(),
		};

		const method = config.method || "POST";
		const response = await fetch(config.url, {
			method,
			headers: {
				"Content-Type": "application/json",
				...config.headers,
			},
			body: method !== "GET" ? JSON.stringify(payload) : undefined,
		});
		return response.ok;
	} catch (error) {
		console.error("[AlertMonitor] Webhook notification failed:", error);
		return false;
	}
}

// Send notification to all enabled channels
async function sendNotifications(
	alert: Alert,
	value: number,
	clusterName: string,
	isTriggered: boolean,
): Promise<void> {
	const channels = getEnabledNotificationChannels();
	if (channels.length === 0) return;

	const conditionText = { gt: ">", lt: "<", gte: ">=", lte: "<=" }[alert.condition];
	const status = isTriggered ? "TRIGGERED" : "RESOLVED";
	const emoji = isTriggered ? "🚨" : "✅";

	const message = `${emoji} <b>${status}: ${alert.name}</b>\n\nCluster: ${clusterName}\nMetric: ${alert.metric} ${conditionText} ${alert.threshold}\nCurrent Value: ${value}`;
	const plainMessage = `${emoji} ${status}: ${alert.name}\n\nCluster: ${clusterName}\nMetric: ${alert.metric} ${conditionText} ${alert.threshold}\nCurrent Value: ${value}`;

	for (const channel of channels) {
		try {
			switch (channel.type) {
				case "telegram":
					await sendTelegramNotification(channel.config as TelegramConfig, message);
					break;
				case "discord":
					await sendDiscordNotification(channel.config as DiscordConfig, plainMessage, isTriggered);
					break;
				case "slack":
					await sendSlackNotification(channel.config as SlackConfig, plainMessage, isTriggered);
					break;
				case "webhook":
					await sendWebhookNotification(channel.config as WebhookConfig, alert, value, clusterName, isTriggered);
					break;
			}
		} catch (error) {
			console.error(`[AlertMonitor] Failed to send to channel ${channel.name}:`, error);
		}
	}
}

// Check all alerts for all clusters
async function checkAlerts(): Promise<void> {
	const clusters = getAllClusters();
	const alerts = getAllAlerts();

	for (const cluster of clusters) {
		if (!cluster.monitoring_urls || cluster.monitoring_urls.length === 0) continue;

		const totals = await getAggregatedVarz(cluster.monitoring_urls);
		if (!totals) continue;

		const clusterAlerts = alerts.filter((a) => a.cluster_id === cluster.id && a.enabled);

		for (const alert of clusterAlerts) {
			const value = getMetricValue(totals, alert.metric);
			const isTriggered = isAlertTriggered(value, alert.condition, alert.threshold);
			const wasTriggered = lastTriggeredState.get(alert.id) ?? false;

			// State changed - send notification
			if (isTriggered !== wasTriggered) {
				lastTriggeredState.set(alert.id, isTriggered);

				const conditionText = { gt: ">", lt: "<", gte: ">=", lte: "<=" }[alert.condition];
				const status: AlertEventStatus = isTriggered ? "triggered" : "resolved";

				// Record event
				createAlertEvent(
					alert.id,
					status,
					value,
					`${alert.metric} ${conditionText} ${alert.threshold} (current: ${value})`,
				);

				// Send notifications
				await sendNotifications(alert, value, cluster.name, isTriggered);

				console.log(
					`[AlertMonitor] Alert "${alert.name}" ${status} for cluster "${cluster.name}" (value: ${value})`,
				);
			}
		}
	}
}

// Get check interval from settings
export function getCheckInterval(): number {
	const setting = getSetting("alert_check_interval");
	return setting ? Number.parseInt(setting, 10) : DEFAULT_CHECK_INTERVAL;
}

// Set check interval in settings
export function setCheckInterval(interval: number): void {
	setSetting("alert_check_interval", String(interval));
	// Restart if running to apply new interval
	if (isRunning) {
		stop();
		start();
	}
}

// Start the alert monitor
export function start(): void {
	if (isRunning) return;

	const interval = getCheckInterval();
	console.log(`[AlertMonitor] Starting with ${interval}ms interval`);

	// Run immediately on start
	checkAlerts().catch(console.error);

	// Then run on interval
	checkInterval = setInterval(() => {
		checkAlerts().catch(console.error);
	}, interval);

	isRunning = true;
	setSetting("alert_monitor_enabled", "true");
}

// Stop the alert monitor
export function stop(): void {
	if (!isRunning || !checkInterval) return;

	console.log("[AlertMonitor] Stopping");
	clearInterval(checkInterval);
	checkInterval = null;
	isRunning = false;
	setSetting("alert_monitor_enabled", "false");
}

// Get monitor status
export function getStatus(): { running: boolean; interval: number; lastCheck?: number } {
	return {
		running: isRunning,
		interval: getCheckInterval(),
	};
}

// Check if monitor should auto-start (was enabled before restart)
export function shouldAutoStart(): boolean {
	return getSetting("alert_monitor_enabled") === "true";
}

// Initialize - auto-start if was enabled
export function initialize(): void {
	if (shouldAutoStart()) {
		start();
	}
}
