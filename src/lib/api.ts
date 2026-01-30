const API_BASE = "/api";

async function request<T>(
	endpoint: string,
	options?: RequestInit,
): Promise<T> {
	const res = await fetch(`${API_BASE}${endpoint}`, {
		...options,
		credentials: "include",
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
		},
	});

	if (!res.ok) {
		const error = await res.json().catch(() => ({ error: "Request failed" }));
		throw new Error(error.error || `HTTP ${res.status}`);
	}

	return res.json();
}

// Auth API
export const authApi = {
	checkSetup: () => request<{ needsSetup: boolean }>("/auth/setup-check"),

	getSession: () =>
		request<{ user: { id: string; username: string } | null }>("/auth/session"),

	login: (username: string, password: string) =>
		request<{ success: boolean; user?: { id: string; username: string }; error?: string }>(
			"/auth/login",
			{
				method: "POST",
				body: JSON.stringify({ username, password }),
			},
		),

	logout: () =>
		request<{ success: boolean }>("/auth/logout", { method: "POST" }),

	setup: (username: string, password: string) =>
		request<{ success: boolean; error?: string }>("/auth/setup", {
			method: "POST",
			body: JSON.stringify({ username, password }),
		}),
};

// Cluster types
export type AuthType = "none" | "token" | "userpass";

export interface ClusterData {
	id: string;
	name: string;
	urls: string[];
	authType: AuthType;
	hasToken: boolean;
	hasUserPass: boolean;
	createdAt: number;
	updatedAt: number;
}

export interface ClusterAuthConfig {
	token?: string;
	username?: string;
	password?: string;
}

export interface TestConnectionResult {
	success: boolean;
	serverInfo?: {
		serverName: string;
		version: string;
		jetstream: boolean;
	};
	error?: string;
}

// Clusters API
export const clustersApi = {
	getAll: () => request<ClusterData[]>("/clusters"),

	getById: (id: string) => request<ClusterData>(`/clusters/${id}`),

	create: (data: {
		name: string;
		urls: string[];
		authType: AuthType;
		token?: string;
		username?: string;
		password?: string;
	}) =>
		request<ClusterData>("/clusters", {
			method: "POST",
			body: JSON.stringify(data),
		}),

	update: (
		id: string,
		data: {
			name?: string;
			urls?: string[];
			authType?: AuthType;
			token?: string;
			username?: string;
			password?: string;
		},
	) =>
		request<ClusterData>(`/clusters/${id}`, {
			method: "PATCH",
			body: JSON.stringify(data),
		}),

	delete: (id: string) =>
		request<{ success: boolean }>(`/clusters/${id}`, { method: "DELETE" }),

	testConnection: (urls: string[], auth?: ClusterAuthConfig) =>
		request<TestConnectionResult>("/clusters/test", {
			method: "POST",
			body: JSON.stringify({ urls, ...auth }),
		}),

	testExisting: (id: string) =>
		request<TestConnectionResult>(`/clusters/${id}/test`, { method: "POST" }),

	getConnectionInfo: (id: string) =>
		request<{
			urls: string[];
			authType: AuthType;
			token?: string;
			username?: string;
			password?: string;
		}>(`/clusters/${id}/connect`),
};

// Stats types
export interface ClusterStats {
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

export interface DashboardStats {
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

// Stats API
export const statsApi = {
	getDashboard: () => request<DashboardStats>("/stats/dashboard"),

	getCluster: (id: string) => request<ClusterStats>(`/stats/cluster/${id}`),
};

// Stream types
export interface StreamState {
	messages: number;
	bytes: number;
	firstSeq: number;
	lastSeq: number;
	consumerCount: number;
	firstTs: string;
	lastTs: string;
}

export interface StreamInfo {
	name: string;
	description?: string;
	subjects: string[];
	retention: string;
	maxConsumers: number;
	maxMsgs: number;
	maxBytes: number;
	maxAge: number;
	maxMsgSize: number;
	storage: string;
	replicas: number;
	discard: string;
	duplicateWindow: number;
	state: StreamState;
	created: string;
}

export interface StreamMessage {
	seq: number;
	subject: string;
	data: string;
	time: string;
	headers?: Record<string, string[]>;
}

export interface StreamMessagesResponse {
	messages: StreamMessage[];
	firstSeq: number;
	lastSeq: number;
	hasMore: boolean;
}

export interface CreateStreamData {
	name: string;
	description?: string;
	subjects: string[];
	retention?: "limits" | "interest" | "workqueue";
	storage?: "file" | "memory";
	maxConsumers?: number;
	maxMsgs?: number;
	maxBytes?: number;
	maxAge?: number;
	maxMsgSize?: number;
	replicas?: number;
	discard?: "old" | "new";
}

export interface UpdateStreamData {
	description?: string;
	subjects?: string[];
	maxConsumers?: number;
	maxMsgs?: number;
	maxBytes?: number;
	maxAge?: number;
	maxMsgSize?: number;
	discard?: "old" | "new";
}

// Streams API
export const streamsApi = {
	list: (clusterId: string) =>
		request<StreamInfo[]>(`/streams/cluster/${clusterId}`),

	get: (clusterId: string, name: string) =>
		request<StreamInfo>(`/streams/cluster/${clusterId}/stream/${name}`),

	create: (clusterId: string, data: CreateStreamData) =>
		request<StreamInfo>(`/streams/cluster/${clusterId}`, {
			method: "POST",
			body: JSON.stringify(data),
		}),

	update: (clusterId: string, name: string, data: UpdateStreamData) =>
		request<StreamInfo>(`/streams/cluster/${clusterId}/stream/${name}`, {
			method: "PATCH",
			body: JSON.stringify(data),
		}),

	delete: (clusterId: string, name: string) =>
		request<{ success: boolean }>(`/streams/cluster/${clusterId}/stream/${name}`, {
			method: "DELETE",
		}),

	purge: (clusterId: string, name: string) =>
		request<{ success: boolean; purged: number }>(
			`/streams/cluster/${clusterId}/stream/${name}/purge`,
			{ method: "POST" },
		),

	getMessages: (clusterId: string, name: string, startSeq?: number, limit?: number) =>
		request<StreamMessagesResponse>(
			`/streams/cluster/${clusterId}/stream/${name}/messages?startSeq=${startSeq ?? 1}&limit=${limit ?? 50}`,
		),
};

// KV types
export interface KvBucketInfo {
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
}

export interface KvEntry {
	key: string;
	value: string;
	revision: number;
	created: string;
	operation?: string;
}

export interface CreateKvBucketData {
	name: string;
	description?: string;
	maxValueSize?: number;
	history?: number;
	ttl?: number;
	maxBytes?: number;
	storage?: "file" | "memory";
	replicas?: number;
}

// KV API
export const kvApi = {
	listBuckets: (clusterId: string) =>
		request<KvBucketInfo[]>(`/kv/cluster/${clusterId}`),

	getBucket: (clusterId: string, name: string) =>
		request<KvBucketInfo>(`/kv/cluster/${clusterId}/bucket/${name}`),

	createBucket: (clusterId: string, data: CreateKvBucketData) =>
		request<KvBucketInfo>(`/kv/cluster/${clusterId}`, {
			method: "POST",
			body: JSON.stringify(data),
		}),

	deleteBucket: (clusterId: string, name: string) =>
		request<{ success: boolean }>(`/kv/cluster/${clusterId}/bucket/${name}`, {
			method: "DELETE",
		}),

	listKeys: (clusterId: string, bucketName: string) =>
		request<KvEntry[]>(`/kv/cluster/${clusterId}/bucket/${bucketName}/keys`),

	getKey: (clusterId: string, bucketName: string, key: string) =>
		request<KvEntry>(`/kv/cluster/${clusterId}/bucket/${bucketName}/key/${encodeURIComponent(key)}`),

	getKeyHistory: (clusterId: string, bucketName: string, key: string) =>
		request<KvEntry[]>(`/kv/cluster/${clusterId}/bucket/${bucketName}/key/${encodeURIComponent(key)}/history`),

	putKey: (clusterId: string, bucketName: string, key: string, value: string) =>
		request<KvEntry>(`/kv/cluster/${clusterId}/bucket/${bucketName}/key`, {
			method: "PUT",
			body: JSON.stringify({ key, value }),
		}),

	deleteKey: (clusterId: string, bucketName: string, key: string) =>
		request<{ success: boolean }>(`/kv/cluster/${clusterId}/bucket/${bucketName}/key/${encodeURIComponent(key)}`, {
			method: "DELETE",
		}),

	purgeKey: (clusterId: string, bucketName: string, key: string) =>
		request<{ success: boolean }>(`/kv/cluster/${clusterId}/bucket/${bucketName}/key/${encodeURIComponent(key)}/purge`, {
			method: "POST",
		}),
};
