import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = "./data/nats-eye.db";

// Ensure data directory exists
function ensureDataDir() {
	const dir = dirname(DB_PATH);
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

// Initialize database with schema
function initializeSchema(db: Database) {
	db.exec(`
		-- Users table (admin authentication)
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		-- Sessions table
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL
		);

		-- Clusters table (NATS cluster configurations)
		CREATE TABLE IF NOT EXISTS clusters (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			urls TEXT NOT NULL,
			nats_urls TEXT,
			auth_type TEXT NOT NULL DEFAULT 'none',
			token TEXT,
			username TEXT,
			password TEXT,
			monitoring_urls TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		-- Alerts table (monitoring alert configurations)
		CREATE TABLE IF NOT EXISTS alerts (
			id TEXT PRIMARY KEY,
			cluster_id TEXT NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			metric TEXT NOT NULL,
			condition TEXT NOT NULL,
			threshold REAL NOT NULL,
			enabled INTEGER DEFAULT 1,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);

		-- Alert events table (alert history)
		CREATE TABLE IF NOT EXISTS alert_events (
			id TEXT PRIMARY KEY,
			alert_id TEXT NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
			status TEXT NOT NULL,
			value REAL NOT NULL,
			message TEXT,
			created_at INTEGER NOT NULL
		);

		-- Settings table (app configuration)
		CREATE TABLE IF NOT EXISTS settings (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		);

		-- Create indexes
		CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
		CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
		CREATE INDEX IF NOT EXISTS idx_alerts_cluster_id ON alerts(cluster_id);
		CREATE INDEX IF NOT EXISTS idx_alert_events_alert_id ON alert_events(alert_id);
		CREATE INDEX IF NOT EXISTS idx_alert_events_created_at ON alert_events(created_at);
	`);

	// Run migrations for existing databases
	runMigrations(db);
}

// Run migrations for existing databases
function runMigrations(db: Database) {
	// Check if nats_urls column exists in clusters table
	const columns = db.query<{ name: string }, []>("PRAGMA table_info(clusters)").all();
	const hasNatsUrls = columns.some((col) => col.name === "nats_urls");
	const hasMonitoringUrl = columns.some((col) => col.name === "monitoring_url");
	const hasMonitoringUrls = columns.some((col) => col.name === "monitoring_urls");

	if (!hasNatsUrls) {
		db.exec("ALTER TABLE clusters ADD COLUMN nats_urls TEXT");
	}

	// Migrate from single monitoring_url to monitoring_urls array
	if (hasMonitoringUrl && !hasMonitoringUrls) {
		db.exec("ALTER TABLE clusters ADD COLUMN monitoring_urls TEXT");
		// Migrate existing data
		const clusters = db.query<{ id: string; monitoring_url: string | null }, []>(
			"SELECT id, monitoring_url FROM clusters WHERE monitoring_url IS NOT NULL"
		).all();
		for (const cluster of clusters) {
			if (cluster.monitoring_url) {
				db.run("UPDATE clusters SET monitoring_urls = ? WHERE id = ?", [
					JSON.stringify([cluster.monitoring_url]),
					cluster.id,
				]);
			}
		}
	} else if (!hasMonitoringUrls) {
		db.exec("ALTER TABLE clusters ADD COLUMN monitoring_urls TEXT");
	}
}

let _db: Database | null = null;

export function getDb(): Database {
	if (_db) return _db;

	ensureDataDir();
	_db = new Database(DB_PATH);
	_db.exec("PRAGMA journal_mode = WAL");
	_db.exec("PRAGMA foreign_keys = ON");
	initializeSchema(_db);

	return _db;
}

// Helper to generate IDs
export function generateId(): string {
	return crypto.randomUUID();
}

// Helper to get current timestamp
export function now(): number {
	return Date.now();
}

// User operations
export interface User {
	id: string;
	username: string;
	password_hash: string;
	created_at: number;
	updated_at: number;
}

export function createUser(
	username: string,
	passwordHash: string,
): User | null {
	const db = getDb();
	const id = generateId();
	const timestamp = now();

	try {
		db.run(
			`INSERT INTO users (id, username, password_hash, created_at, updated_at)
			 VALUES (?, ?, ?, ?, ?)`,
			[id, username, passwordHash, timestamp, timestamp],
		);
		return {
			id,
			username,
			password_hash: passwordHash,
			created_at: timestamp,
			updated_at: timestamp,
		};
	} catch {
		return null;
	}
}

export function getUserByUsername(username: string): User | null {
	const db = getDb();
	return db
		.query<User, [string]>("SELECT * FROM users WHERE username = ?")
		.get(username);
}

export function getUserById(id: string): User | null {
	const db = getDb();
	return db.query<User, [string]>("SELECT * FROM users WHERE id = ?").get(id);
}

export function getUserCount(): number {
	const db = getDb();
	const result = db
		.query<{ count: number }, []>("SELECT COUNT(*) as count FROM users")
		.get();
	return result?.count ?? 0;
}

// Session operations
export interface Session {
	id: string;
	user_id: string;
	expires_at: number;
	created_at: number;
}

export function createSession(
	userId: string,
	expiresInMs = 7 * 24 * 60 * 60 * 1000,
): Session {
	const db = getDb();
	const id = generateId();
	const timestamp = now();
	const expiresAt = timestamp + expiresInMs;

	db.run(
		`INSERT INTO sessions (id, user_id, expires_at, created_at)
		 VALUES (?, ?, ?, ?)`,
		[id, userId, expiresAt, timestamp],
	);

	return { id, user_id: userId, expires_at: expiresAt, created_at: timestamp };
}

export function getSession(id: string): (Session & { user: User }) | null {
	const db = getDb();
	const result = db
		.query<Session & User, [string, number]>(`
		SELECT s.*, u.id as uid, u.username, u.password_hash, u.created_at as user_created_at, u.updated_at as user_updated_at
		FROM sessions s
		JOIN users u ON s.user_id = u.id
		WHERE s.id = ? AND s.expires_at > ?
	`)
		.get(id, now());

	if (!result) return null;

	return {
		id: result.id,
		user_id: result.user_id,
		expires_at: result.expires_at,
		created_at: result.created_at,
		user: {
			id: result.user_id,
			username: result.username,
			password_hash: result.password_hash,
			created_at: result.created_at,
			updated_at: result.updated_at,
		},
	};
}

export function deleteSession(id: string): void {
	const db = getDb();
	db.run("DELETE FROM sessions WHERE id = ?", [id]);
}

export function deleteExpiredSessions(): void {
	const db = getDb();
	db.run("DELETE FROM sessions WHERE expires_at <= ?", [now()]);
}

// Cluster operations
export type AuthType = "none" | "token" | "userpass";

export interface Cluster {
	id: string;
	name: string;
	urls: string[];
	nats_urls: string[] | null;
	auth_type: AuthType;
	token: string | null;
	username: string | null;
	password: string | null;
	monitoring_urls: string[] | null;
	created_at: number;
	updated_at: number;
}

interface ClusterRow {
	id: string;
	name: string;
	urls: string;
	nats_urls: string | null;
	auth_type: string;
	token: string | null;
	username: string | null;
	password: string | null;
	monitoring_urls: string | null;
	created_at: number;
	updated_at: number;
}

function rowToCluster(row: ClusterRow): Cluster {
	return {
		...row,
		auth_type: row.auth_type as AuthType,
		urls: JSON.parse(row.urls),
		nats_urls: row.nats_urls ? JSON.parse(row.nats_urls) : null,
		monitoring_urls: row.monitoring_urls ? JSON.parse(row.monitoring_urls) : null,
	};
}

export function createCluster(
	name: string,
	urls: string[],
	authType: AuthType = "none",
	token?: string,
	username?: string,
	password?: string,
	natsUrls?: string[],
	monitoringUrls?: string[],
): Cluster {
	const db = getDb();
	const id = generateId();
	const timestamp = now();

	db.run(
		`INSERT INTO clusters (id, name, urls, nats_urls, auth_type, token, username, password, monitoring_urls, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			id,
			name,
			JSON.stringify(urls),
			natsUrls ? JSON.stringify(natsUrls) : null,
			authType,
			token ?? null,
			username ?? null,
			password ?? null,
			monitoringUrls ? JSON.stringify(monitoringUrls) : null,
			timestamp,
			timestamp,
		],
	);

	return {
		id,
		name,
		urls,
		nats_urls: natsUrls ?? null,
		auth_type: authType,
		token: token ?? null,
		username: username ?? null,
		password: password ?? null,
		monitoring_urls: monitoringUrls ?? null,
		created_at: timestamp,
		updated_at: timestamp,
	};
}

export function getCluster(id: string): Cluster | null {
	const db = getDb();
	const row = db
		.query<ClusterRow, [string]>("SELECT * FROM clusters WHERE id = ?")
		.get(id);
	return row ? rowToCluster(row) : null;
}

export function getAllClusters(): Cluster[] {
	const db = getDb();
	const rows = db
		.query<ClusterRow, []>("SELECT * FROM clusters ORDER BY name")
		.all();
	return rows.map(rowToCluster);
}

export function updateCluster(
	id: string,
	data: Partial<Pick<Cluster, "name" | "urls" | "nats_urls" | "auth_type" | "token" | "username" | "password" | "monitoring_urls">>,
): Cluster | null {
	const db = getDb();
	const existing = getCluster(id);
	if (!existing) return null;

	const updates: string[] = [];
	const values: (string | number | null)[] = [];

	if (data.name !== undefined) {
		updates.push("name = ?");
		values.push(data.name);
	}
	if (data.urls !== undefined) {
		updates.push("urls = ?");
		values.push(JSON.stringify(data.urls));
	}
	if (data.nats_urls !== undefined) {
		updates.push("nats_urls = ?");
		values.push(data.nats_urls ? JSON.stringify(data.nats_urls) : null);
	}
	if (data.auth_type !== undefined) {
		updates.push("auth_type = ?");
		values.push(data.auth_type);
	}
	if (data.token !== undefined) {
		updates.push("token = ?");
		values.push(data.token);
	}
	if (data.username !== undefined) {
		updates.push("username = ?");
		values.push(data.username);
	}
	if (data.password !== undefined) {
		updates.push("password = ?");
		values.push(data.password);
	}
	if (data.monitoring_urls !== undefined) {
		updates.push("monitoring_urls = ?");
		values.push(data.monitoring_urls ? JSON.stringify(data.monitoring_urls) : null);
	}

	if (updates.length === 0) return existing;

	updates.push("updated_at = ?");
	values.push(now());
	values.push(id);

	db.run(`UPDATE clusters SET ${updates.join(", ")} WHERE id = ?`, values);
	return getCluster(id);
}

export function deleteCluster(id: string): boolean {
	const db = getDb();
	const result = db.run("DELETE FROM clusters WHERE id = ?", [id]);
	return result.changes > 0;
}

// Settings operations
export function getSetting(key: string): string | null {
	const db = getDb();
	const result = db
		.query<{ value: string }, [string]>(
			"SELECT value FROM settings WHERE key = ?",
		)
		.get(key);
	return result?.value ?? null;
}

export function setSetting(key: string, value: string): void {
	const db = getDb();
	db.run(
		`INSERT INTO settings (key, value) VALUES (?, ?)
		 ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
		[key, value],
	);
}

export function deleteSetting(key: string): void {
	const db = getDb();
	db.run("DELETE FROM settings WHERE key = ?", [key]);
}

// Alert operations
export type AlertMetric = "connections" | "subscriptions" | "slow_consumers" | "in_msgs_rate" | "out_msgs_rate";
export type AlertCondition = "gt" | "lt" | "gte" | "lte";

export interface Alert {
	id: string;
	cluster_id: string;
	name: string;
	metric: AlertMetric;
	condition: AlertCondition;
	threshold: number;
	enabled: boolean;
	created_at: number;
	updated_at: number;
}

interface AlertRow {
	id: string;
	cluster_id: string;
	name: string;
	metric: string;
	condition: string;
	threshold: number;
	enabled: number;
	created_at: number;
	updated_at: number;
}

function rowToAlert(row: AlertRow): Alert {
	return {
		...row,
		metric: row.metric as AlertMetric,
		condition: row.condition as AlertCondition,
		enabled: row.enabled === 1,
	};
}

export function createAlert(
	clusterId: string,
	name: string,
	metric: AlertMetric,
	condition: AlertCondition,
	threshold: number,
	enabled = true,
): Alert {
	const db = getDb();
	const id = generateId();
	const timestamp = now();

	db.run(
		`INSERT INTO alerts (id, cluster_id, name, metric, condition, threshold, enabled, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[id, clusterId, name, metric, condition, threshold, enabled ? 1 : 0, timestamp, timestamp],
	);

	return {
		id,
		cluster_id: clusterId,
		name,
		metric,
		condition,
		threshold,
		enabled,
		created_at: timestamp,
		updated_at: timestamp,
	};
}

export function getAlert(id: string): Alert | null {
	const db = getDb();
	const row = db
		.query<AlertRow, [string]>("SELECT * FROM alerts WHERE id = ?")
		.get(id);
	return row ? rowToAlert(row) : null;
}

export function getAlertsByCluster(clusterId: string): Alert[] {
	const db = getDb();
	const rows = db
		.query<AlertRow, [string]>("SELECT * FROM alerts WHERE cluster_id = ? ORDER BY name")
		.all(clusterId);
	return rows.map(rowToAlert);
}

export function getAllAlerts(): Alert[] {
	const db = getDb();
	const rows = db
		.query<AlertRow, []>("SELECT * FROM alerts ORDER BY name")
		.all();
	return rows.map(rowToAlert);
}

export function updateAlert(
	id: string,
	data: Partial<Pick<Alert, "name" | "metric" | "condition" | "threshold" | "enabled">>,
): Alert | null {
	const db = getDb();
	const existing = getAlert(id);
	if (!existing) return null;

	const updates: string[] = [];
	const values: (string | number | null)[] = [];

	if (data.name !== undefined) {
		updates.push("name = ?");
		values.push(data.name);
	}
	if (data.metric !== undefined) {
		updates.push("metric = ?");
		values.push(data.metric);
	}
	if (data.condition !== undefined) {
		updates.push("condition = ?");
		values.push(data.condition);
	}
	if (data.threshold !== undefined) {
		updates.push("threshold = ?");
		values.push(data.threshold);
	}
	if (data.enabled !== undefined) {
		updates.push("enabled = ?");
		values.push(data.enabled ? 1 : 0);
	}

	if (updates.length === 0) return existing;

	updates.push("updated_at = ?");
	values.push(now());
	values.push(id);

	db.run(`UPDATE alerts SET ${updates.join(", ")} WHERE id = ?`, values);
	return getAlert(id);
}

export function deleteAlert(id: string): boolean {
	const db = getDb();
	const result = db.run("DELETE FROM alerts WHERE id = ?", [id]);
	return result.changes > 0;
}

// Alert events operations
export type AlertEventStatus = "triggered" | "resolved";

export interface AlertEvent {
	id: string;
	alert_id: string;
	status: AlertEventStatus;
	value: number;
	message: string | null;
	created_at: number;
}

interface AlertEventRow {
	id: string;
	alert_id: string;
	status: string;
	value: number;
	message: string | null;
	created_at: number;
}

function rowToAlertEvent(row: AlertEventRow): AlertEvent {
	return {
		...row,
		status: row.status as AlertEventStatus,
	};
}

export function createAlertEvent(
	alertId: string,
	status: AlertEventStatus,
	value: number,
	message?: string,
): AlertEvent {
	const db = getDb();
	const id = generateId();
	const timestamp = now();

	db.run(
		`INSERT INTO alert_events (id, alert_id, status, value, message, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		[id, alertId, status, value, message ?? null, timestamp],
	);

	return {
		id,
		alert_id: alertId,
		status,
		value,
		message: message ?? null,
		created_at: timestamp,
	};
}

export function getAlertEvents(alertId: string, limit = 50): AlertEvent[] {
	const db = getDb();
	const rows = db
		.query<AlertEventRow, [string, number]>(
			"SELECT * FROM alert_events WHERE alert_id = ? ORDER BY created_at DESC LIMIT ?",
		)
		.all(alertId, limit);
	return rows.map(rowToAlertEvent);
}

export function getRecentAlertEvents(limit = 100): AlertEvent[] {
	const db = getDb();
	const rows = db
		.query<AlertEventRow, [number]>(
			"SELECT * FROM alert_events ORDER BY created_at DESC LIMIT ?",
		)
		.all(limit);
	return rows.map(rowToAlertEvent);
}

export function deleteAlertEventsByAlertId(alertId: string): void {
	const db = getDb();
	db.run("DELETE FROM alert_events WHERE alert_id = ?", [alertId]);
}
