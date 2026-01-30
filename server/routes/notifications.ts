import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
	createNotificationChannel,
	deleteNotificationChannel,
	getAllNotificationChannels,
	getNotificationChannel,
	updateNotificationChannel,
	type NotificationChannelType,
	type TelegramConfig,
	type DiscordConfig,
	type WebhookConfig,
	type SlackConfig,
} from "../db";
import * as alertMonitor from "../services/alert-monitor";

const notifications = new Hono();

// Notification channel schemas
const telegramConfigSchema = z.object({
	botToken: z.string().min(1),
	chatId: z.string().min(1),
});

const discordConfigSchema = z.object({
	webhookUrl: z.string().url(),
});

const slackConfigSchema = z.object({
	webhookUrl: z.string().url(),
});

const webhookConfigSchema = z.object({
	url: z.string().url(),
	method: z.enum(["GET", "POST"]).optional(),
	headers: z.record(z.string()).optional(),
});

const createChannelSchema = z.object({
	name: z.string().min(1),
	type: z.enum(["telegram", "discord", "webhook", "slack"]),
	config: z.union([telegramConfigSchema, discordConfigSchema, slackConfigSchema, webhookConfigSchema]),
	enabled: z.boolean().optional(),
});

const updateChannelSchema = z.object({
	name: z.string().min(1).optional(),
	type: z.enum(["telegram", "discord", "webhook", "slack"]).optional(),
	config: z.union([telegramConfigSchema, discordConfigSchema, slackConfigSchema, webhookConfigSchema]).optional(),
	enabled: z.boolean().optional(),
});

// Get all notification channels
notifications.get("/channels", (c) => {
	const channels = getAllNotificationChannels();
	// Mask sensitive data in response
	const masked = channels.map((ch) => ({
		...ch,
		config: maskConfig(ch.type, ch.config),
	}));
	return c.json(masked);
});

// Get single notification channel
notifications.get("/channels/:id", (c) => {
	const id = c.req.param("id");
	const channel = getNotificationChannel(id);
	if (!channel) {
		return c.json({ error: "Channel not found" }, 404);
	}
	return c.json({
		...channel,
		config: maskConfig(channel.type, channel.config),
	});
});

// Create notification channel
notifications.post("/channels", zValidator("json", createChannelSchema), (c) => {
	const data = c.req.valid("json");

	const channel = createNotificationChannel(
		data.name,
		data.type as NotificationChannelType,
		data.config,
		data.enabled ?? true,
	);

	return c.json(channel, 201);
});

// Update notification channel
notifications.patch("/channels/:id", zValidator("json", updateChannelSchema), (c) => {
	const id = c.req.param("id");
	const data = c.req.valid("json");

	const updated = updateNotificationChannel(id, data);
	if (!updated) {
		return c.json({ error: "Channel not found" }, 404);
	}

	return c.json(updated);
});

// Delete notification channel
notifications.delete("/channels/:id", (c) => {
	const id = c.req.param("id");
	const deleted = deleteNotificationChannel(id);
	if (!deleted) {
		return c.json({ error: "Channel not found" }, 404);
	}
	return c.json({ success: true });
});

// Test notification channel
notifications.post("/channels/:id/test", async (c) => {
	const id = c.req.param("id");
	const channel = getNotificationChannel(id);
	if (!channel) {
		return c.json({ error: "Channel not found" }, 404);
	}

	try {
		const testMessage = "🔔 Test notification from NATS Eye";
		let success = false;

		switch (channel.type) {
			case "telegram": {
				const config = channel.config as TelegramConfig;
				const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: config.chatId,
						text: testMessage,
					}),
				});
				success = response.ok;
				break;
			}
			case "discord": {
				const config = channel.config as DiscordConfig;
				const response = await fetch(config.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						embeds: [{
							title: "Test Notification",
							description: testMessage,
							color: 0x0099ff,
						}],
					}),
				});
				success = response.ok;
				break;
			}
			case "slack": {
				const config = channel.config as SlackConfig;
				const response = await fetch(config.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						text: testMessage,
					}),
				});
				success = response.ok;
				break;
			}
			case "webhook": {
				const config = channel.config as WebhookConfig;
				const response = await fetch(config.url, {
					method: config.method || "POST",
					headers: {
						"Content-Type": "application/json",
						...config.headers,
					},
					body: JSON.stringify({
						type: "test",
						message: testMessage,
						timestamp: new Date().toISOString(),
					}),
				});
				success = response.ok;
				break;
			}
		}

		return c.json({ success });
	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Failed to send test notification",
		});
	}
});

// Test credentials without saving (for testing before creating a channel)
const testCredentialsSchema = z.object({
	type: z.enum(["telegram", "discord", "webhook", "slack"]),
	config: z.union([telegramConfigSchema, discordConfigSchema, slackConfigSchema, webhookConfigSchema]),
});

notifications.post("/test", zValidator("json", testCredentialsSchema), async (c) => {
	const { type, config } = c.req.valid("json");

	try {
		const testMessage = "🔔 Test notification from NATS Eye - Your credentials are working!";
		let success = false;
		let errorMessage = "";

		switch (type) {
			case "telegram": {
				const tc = config as TelegramConfig;
				const url = `https://api.telegram.org/bot${tc.botToken}/sendMessage`;
				const response = await fetch(url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chat_id: tc.chatId,
						text: testMessage,
					}),
				});
				if (!response.ok) {
					const data = await response.json().catch(() => ({}));
					errorMessage = (data as { description?: string }).description || `HTTP ${response.status}`;
				}
				success = response.ok;
				break;
			}
			case "discord": {
				const dc = config as DiscordConfig;
				const response = await fetch(dc.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						embeds: [{
							title: "Test Notification",
							description: testMessage,
							color: 0x0099ff,
						}],
					}),
				});
				if (!response.ok) {
					errorMessage = `HTTP ${response.status}`;
				}
				success = response.ok;
				break;
			}
			case "slack": {
				const sc = config as SlackConfig;
				const response = await fetch(sc.webhookUrl, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						text: testMessage,
					}),
				});
				if (!response.ok) {
					errorMessage = `HTTP ${response.status}`;
				}
				success = response.ok;
				break;
			}
			case "webhook": {
				const wc = config as WebhookConfig;
				const response = await fetch(wc.url, {
					method: wc.method || "POST",
					headers: {
						"Content-Type": "application/json",
						...wc.headers,
					},
					body: JSON.stringify({
						type: "test",
						message: testMessage,
						timestamp: new Date().toISOString(),
					}),
				});
				if (!response.ok) {
					errorMessage = `HTTP ${response.status}`;
				}
				success = response.ok;
				break;
			}
		}

		return c.json({ success, error: errorMessage || undefined });
	} catch (error) {
		return c.json({
			success: false,
			error: error instanceof Error ? error.message : "Failed to send test notification",
		});
	}
});

// Alert monitor control endpoints
notifications.get("/monitor/status", (c) => {
	return c.json(alertMonitor.getStatus());
});

notifications.post("/monitor/start", (c) => {
	alertMonitor.start();
	return c.json({ success: true, ...alertMonitor.getStatus() });
});

notifications.post("/monitor/stop", (c) => {
	alertMonitor.stop();
	return c.json({ success: true, ...alertMonitor.getStatus() });
});

const setIntervalSchema = z.object({
	interval: z.number().min(5000).max(3600000), // 5 seconds to 1 hour
});

notifications.post("/monitor/interval", zValidator("json", setIntervalSchema), (c) => {
	const { interval } = c.req.valid("json");
	alertMonitor.setCheckInterval(interval);
	return c.json({ success: true, interval });
});

// Helper to mask sensitive config data
function maskConfig(type: NotificationChannelType, config: unknown): unknown {
	switch (type) {
		case "telegram": {
			const tc = config as TelegramConfig;
			return {
				botToken: tc.botToken ? `${tc.botToken.slice(0, 8)}...` : "",
				chatId: tc.chatId,
			};
		}
		case "discord":
		case "slack": {
			const dc = config as DiscordConfig | SlackConfig;
			return {
				webhookUrl: dc.webhookUrl ? `${dc.webhookUrl.slice(0, 30)}...` : "",
			};
		}
		case "webhook": {
			const wc = config as WebhookConfig;
			return {
				url: wc.url,
				method: wc.method || "POST",
				headers: wc.headers ? Object.keys(wc.headers) : [],
			};
		}
		default:
			return config;
	}
}

export default notifications;
