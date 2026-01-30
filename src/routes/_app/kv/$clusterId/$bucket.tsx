import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Copy,
	Database,
	Edit,
	Eye,
	EyeOff,
	History,
	Key,
	Pause,
	Play,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import { connect, type NatsConnection, type KV, type KvEntry as NatsKvEntry } from "nats.ws";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { clustersApi, kvApi, type KvEntry } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/kv/$clusterId/$bucket")({
	component: KvBucketPage,
});

function formatDate(dateStr: string): string {
	if (!dateStr) return "N/A";
	const date = new Date(dateStr);
	return date.toLocaleString();
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

// Track recently changed keys for animation
interface KeyChange {
	key: string;
	type: "added" | "updated" | "deleted";
	timestamp: number;
}

interface LocalKvEntry {
	key: string;
	value: string;
	revision: number;
	created: string;
}

function KvBucketPage() {
	const { clusterId, bucket } = Route.useParams();

	const [searchQuery, setSearchQuery] = useState("");
	const [isWatching, setIsWatching] = useState(false);
	const [natsConnected, setNatsConnected] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [showAddDialog, setShowAddDialog] = useState(false);
	const [editingKey, setEditingKey] = useState<LocalKvEntry | null>(null);
	const [viewingKey, setViewingKey] = useState<LocalKvEntry | null>(null);
	const [showHistory, setShowHistory] = useState<string | null>(null);
	const [recentChanges, setRecentChanges] = useState<KeyChange[]>([]);
	const [keys, setKeys] = useState<LocalKvEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const ncRef = useRef<NatsConnection | null>(null);
	const kvRef = useRef<KV | null>(null);
	const watcherRef = useRef<AsyncIterable<NatsKvEntry> | null>(null);
	const isWatchingRef = useRef(false);
	const isMountedRef = useRef(true);

	const { data: cluster } = useQuery({
		queryKey: ["cluster", clusterId],
		queryFn: () => clustersApi.getById(clusterId),
	});

	const { data: bucketInfo, isLoading: loadingBucket, refetch: refetchBucket } = useQuery({
		queryKey: ["kv-bucket", clusterId, bucket],
		queryFn: () => kvApi.getBucket(clusterId, bucket),
	});

	const { data: keyHistory } = useQuery({
		queryKey: ["kv-key-history", clusterId, bucket, showHistory],
		queryFn: () => kvApi.getKeyHistory(clusterId, bucket, showHistory!),
		enabled: !!showHistory,
	});

	// Connect to NATS and load initial keys
	const connectToNats = useCallback(async () => {
		if (ncRef.current) return;

		setConnectionError(null);
		setIsLoading(true);

		try {
			// Get connection info from API
			const connInfo = await clustersApi.getConnectionInfo(clusterId);

			// Check for mixed content issues (HTTP page trying to use WSS, or HTTPS page trying to use WS)
			const pageProtocol = window.location.protocol;
			const isSecurePage = pageProtocol === 'https:';
			const hasSecureWs = connInfo.urls.some(url => url.startsWith('wss://'));
			const hasInsecureWs = connInfo.urls.some(url => url.startsWith('ws://') && !url.startsWith('wss://'));

			if (isSecurePage && hasInsecureWs && !hasSecureWs) {
				throw new Error(
					'Security Error: This page is served over HTTPS but the NATS server uses insecure WebSocket (ws://). ' +
					'Please configure your NATS server to use secure WebSocket (wss://) or access this app over HTTP.'
				);
			}

			// Build connection options
			const opts: Parameters<typeof connect>[0] = {
				servers: connInfo.urls,
				timeout: 10000, // 10 second timeout
			};

			if (connInfo.authType === "token" && connInfo.token) {
				opts.token = connInfo.token;
			} else if (connInfo.authType === "userpass" && connInfo.username && connInfo.password) {
				opts.user = connInfo.username;
				opts.pass = connInfo.password;
			}

			// Connect to NATS
			const nc = await connect(opts);
			if (!isMountedRef.current) {
				await nc.close();
				return;
			}

			ncRef.current = nc;
			setNatsConnected(true);

			// Get JetStream and KV
			const js = nc.jetstream();
			const kv = await js.views.kv(bucket);
			kvRef.current = kv;

			// Load initial keys using the API (more reliable than iterating via NATS)
			try {
				const keysFromApi = await kvApi.listKeys(clusterId, bucket);
				setKeys(keysFromApi.map(k => ({
					key: k.key,
					value: k.value,
					revision: k.revision,
					created: k.created,
				})));
			} catch (err) {
				console.error("Failed to load keys from API:", err);
				setKeys([]);
			}

			setIsLoading(false);

			// Monitor connection status
			(async () => {
				for await (const status of nc.status()) {
					if (!isMountedRef.current) break;
					if (status.type === "disconnect" || status.type === "error") {
						setNatsConnected(false);
						if (status.type === "error") {
							setConnectionError(`Connection error: ${status.data}`);
						}
					} else if (status.type === "reconnect") {
						setNatsConnected(true);
						setConnectionError(null);
					}
				}
			})();
		} catch (err) {
			console.error("Failed to connect to NATS:", err);
			let errorMessage = err instanceof Error ? err.message : "Connection failed";

			// Add helpful hints for common issues
			if (errorMessage.includes('WebSocket') || errorMessage.includes('connect')) {
				const isSecurePage = window.location.protocol === 'https:';
				if (isSecurePage) {
					errorMessage += '\n\nNote: You are accessing this app over HTTPS. Make sure your NATS server supports secure WebSocket (wss://) connections.';
				}
			}

			setConnectionError(errorMessage);
			setNatsConnected(false);
			setIsLoading(false);
		}
	}, [clusterId, bucket]);

	// Start watching for changes
	const startWatch = useCallback(async () => {
		if (!kvRef.current || isWatchingRef.current) return;

		isWatchingRef.current = true;

		try {
			const watcher = await kvRef.current.watch({ key: ">" });
			watcherRef.current = watcher;

			// Skip initial values (we already have them)
			let skipInitial = true;
			const initialTimeout = setTimeout(() => { skipInitial = false; }, 500);

			for await (const entry of watcher) {
				if (!isMountedRef.current || !isWatchingRef.current) break;

				// Skip the initial batch of existing values
				if (skipInitial) {
					continue;
				}

				const now = Date.now();

				if (entry.operation === "PUT") {
					const newEntry: LocalKvEntry = {
						key: entry.key,
						value: entry.value ? new TextDecoder().decode(entry.value) : "",
						revision: entry.revision,
						created: entry.created.toISOString(),
					};

					setKeys((prev) => {
						const exists = prev.find((k) => k.key === entry.key);
						if (exists) {
							// Only mark as updated if revision changed
							if (exists.revision !== entry.revision) {
								setRecentChanges((rc) => [...rc, { key: entry.key, type: "updated", timestamp: now }].slice(-50));
							}
							return prev.map((k) => (k.key === entry.key ? newEntry : k));
						}
						// Add new
						setRecentChanges((rc) => [...rc, { key: entry.key, type: "added", timestamp: now }].slice(-50));
						return [...prev, newEntry];
					});
				} else if (entry.operation === "DEL" || entry.operation === "PURGE") {
					setRecentChanges((rc) => [...rc, { key: entry.key, type: "deleted", timestamp: now }].slice(-50));
					setKeys((prev) => prev.filter((k) => k.key !== entry.key));
				}

				// Refresh bucket info
				refetchBucket();
			}

			clearTimeout(initialTimeout);
		} catch (err) {
			if (isMountedRef.current) {
				console.error("Watch error:", err);
			}
		} finally {
			isWatchingRef.current = false;
		}
	}, [refetchBucket]);

	// Stop watching
	const stopWatch = useCallback(() => {
		isWatchingRef.current = false;
		if (watcherRef.current && 'stop' in watcherRef.current) {
			(watcherRef.current as { stop: () => void }).stop();
		}
		watcherRef.current = null;
	}, []);

	// Toggle watching
	const toggleWatching = useCallback(() => {
		if (isWatching) {
			stopWatch();
			setIsWatching(false);
		} else {
			setIsWatching(true);
			startWatch();
		}
	}, [isWatching, startWatch, stopWatch]);

	// Disconnect from NATS
	const disconnectFromNats = useCallback(() => {
		stopWatch();
		kvRef.current = null;

		if (ncRef.current) {
			ncRef.current.close().catch(() => {});
			ncRef.current = null;
		}
		setNatsConnected(false);
		setIsWatching(false);
	}, [stopWatch]);

	// Connect on mount, disconnect on unmount
	useEffect(() => {
		isMountedRef.current = true;
		connectToNats();

		return () => {
			isMountedRef.current = false;
			disconnectFromNats();
		};
	}, [clusterId, bucket]); // Only reconnect when cluster or bucket changes

	// Clean up old changes
	useEffect(() => {
		const interval = setInterval(() => {
			const cutoff = Date.now() - 3000; // 3 seconds
			setRecentChanges((prev) => prev.filter((c) => c.timestamp > cutoff));
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	const getChangeType = useCallback(
		(key: string): "added" | "updated" | null => {
			const change = recentChanges.find((c) => c.key === key);
			if (change && (change.type === "added" || change.type === "updated")) {
				return change.type;
			}
			return null;
		},
		[recentChanges]
	);

	const filteredKeys = keys?.filter(
		(entry) =>
			entry.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
			entry.value.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const handleDelete = async (key: string) => {
		if (!confirm(`Delete key "${key}"?`)) return;

		try {
			if (kvRef.current) {
				await kvRef.current.delete(key);
				// The watch will handle updating the UI
			}
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete key");
		}
	};

	const handlePutKey = async (key: string, value: string) => {
		if (kvRef.current) {
			const encoder = new TextEncoder();
			await kvRef.current.put(key, encoder.encode(value));
		}
	};

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
	};

	// Refresh keys manually
	const handleRefresh = async () => {
		if (!ncRef.current) {
			await connectToNats();
			return;
		}

		setIsLoading(true);
		try {
			// Use the API to get all keys (most reliable)
			const keysFromApi = await kvApi.listKeys(clusterId, bucket);
			setKeys(keysFromApi.map(k => ({
				key: k.key,
				value: k.value,
				revision: k.revision,
				created: k.created,
			})));
			refetchBucket();
		} catch (err) {
			console.error("Failed to refresh keys:", err);
		} finally {
			setIsLoading(false);
		}
	};

	if (connectionError && !natsConnected) {
		return (
			<>
				<AppHeader
					title={bucket}
					breadcrumbs={[
						{ label: "KV Store", href: "/kv" },
						{ label: bucket },
					]}
				/>
				<div className="page-content">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircle className="h-5 w-5" />
								Connection Error
							</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							<p className="text-sm text-muted-foreground whitespace-pre-wrap">{connectionError}</p>
							<div className="flex gap-2">
								<Button variant="outline" onClick={() => connectToNats()}>
									<RefreshCw className="h-4 w-4 mr-2" />
									Retry
								</Button>
								<Button asChild variant="outline">
									<Link to="/kv">
										<ArrowLeft className="h-4 w-4 mr-2" />
										Back to KV Store
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</>
		);
	}

	return (
		<>
			<AppHeader
				title={bucket}
				breadcrumbs={[
					{ label: "KV Store", href: "/kv" },
					{ label: cluster?.name || clusterId, href: "/kv" },
					{ label: bucket },
				]}
			>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant={isWatching ? "default" : "outline"}
								size="sm"
								onClick={toggleWatching}
								disabled={!natsConnected}
							>
								{isWatching ? (
									<>
										<Pause className="h-4 w-4 mr-2" />
										Watching
									</>
								) : (
									<>
										<Play className="h-4 w-4 mr-2" />
										Watch
									</>
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							{isWatching ? "Click to pause live updates" : "Click to watch for live updates"}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>

				<Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading}>
					<RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
				</Button>
			</AppHeader>

			<div className="page-content">
				{/* Bucket Stats */}
				{loadingBucket ? (
					<div className="grid gap-4 md:grid-cols-4">
						{[...Array(4)].map((_, i) => (
							<Card key={i}>
								<CardHeader className="pb-2">
									<Skeleton className="h-4 w-16" />
								</CardHeader>
								<CardContent>
									<Skeleton className="h-6 w-20" />
								</CardContent>
							</Card>
						))}
					</div>
				) : bucketInfo ? (
					<div className="grid gap-4 md:grid-cols-4">
						<Card>
							<CardHeader className="flex flex-row items-center justify-between pb-2">
								<CardTitle className="text-sm font-medium">Keys</CardTitle>
								<Key className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{bucketInfo.values}</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between pb-2">
								<CardTitle className="text-sm font-medium">Size</CardTitle>
								<Database className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{formatBytes(bucketInfo.size)}</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between pb-2">
								<CardTitle className="text-sm font-medium">History</CardTitle>
								<History className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<div className="text-2xl font-bold">{bucketInfo.history} rev</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader className="flex flex-row items-center justify-between pb-2">
								<CardTitle className="text-sm font-medium">Storage</CardTitle>
								<Database className="h-4 w-4 text-muted-foreground" />
							</CardHeader>
							<CardContent>
								<Badge variant={bucketInfo.storage === "file" ? "default" : "secondary"}>
									{bucketInfo.storage}
								</Badge>
							</CardContent>
						</Card>
					</div>
				) : null}

				{/* Keys Section */}
				<Card>
					<CardHeader>
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle>Keys</CardTitle>
								<CardDescription>
									{natsConnected ? (
										isWatching ? (
											<span className="inline-flex items-center gap-1">
												<span className="relative flex h-2 w-2">
													<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
													<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
												</span>
												Watching for changes
											</span>
										) : (
											<span className="inline-flex items-center gap-1">
												<span className="h-2 w-2 rounded-full bg-yellow-500"></span>
												Connected (not watching)
											</span>
										)
									) : (
										<span className="inline-flex items-center gap-1">
											<span className="h-2 w-2 rounded-full bg-gray-500"></span>
											Disconnected
										</span>
									)}
								</CardDescription>
							</div>
							<div className="flex items-center gap-2">
								<div className="relative">
									<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
									<Input
										placeholder="Search keys..."
										value={searchQuery}
										onChange={(e) => setSearchQuery(e.target.value)}
										className="pl-8 w-[200px]"
									/>
								</div>
								<Button onClick={() => setShowAddDialog(true)} disabled={!natsConnected}>
									<Plus className="h-4 w-4 mr-2" />
									Add Key
								</Button>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						{isLoading ? (
							<div className="space-y-2">
								<Skeleton className="h-10 w-full" />
								<Skeleton className="h-10 w-full" />
								<Skeleton className="h-10 w-full" />
							</div>
						) : filteredKeys && filteredKeys.length > 0 ? (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Key</TableHead>
										<TableHead>Value</TableHead>
										<TableHead className="w-[100px]">Revision</TableHead>
										<TableHead className="w-[180px]">Updated</TableHead>
										<TableHead className="w-[120px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredKeys.map((entry) => {
										const changeType = getChangeType(entry.key);
										return (
											<TableRow
												key={entry.key}
												className={cn(
													"transition-colors duration-500",
													changeType === "added" && "animate-pulse bg-green-500/10",
													changeType === "updated" && "animate-pulse bg-blue-500/10"
												)}
											>
												<TableCell className="font-mono text-sm">
													<div className="flex items-center gap-2">
														{entry.key}
														{changeType && (
															<Badge
																variant={changeType === "added" ? "default" : "secondary"}
																className={cn(
																	"text-xs animate-in fade-in-0 zoom-in-95",
																	changeType === "added" && "bg-green-500",
																	changeType === "updated" && "bg-blue-500"
																)}
															>
																{changeType}
															</Badge>
														)}
													</div>
												</TableCell>
												<TableCell className="font-mono text-sm max-w-[300px]">
													<div className="truncate" title={entry.value}>
														{entry.value.length > 100
															? `${entry.value.slice(0, 100)}...`
															: entry.value}
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="outline">r{entry.revision}</Badge>
												</TableCell>
												<TableCell className="text-xs text-muted-foreground">
													{formatDate(entry.created)}
												</TableCell>
												<TableCell>
													<div className="flex items-center gap-1">
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8"
																		onClick={() => setViewingKey(entry)}
																	>
																		<Eye className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>View</TooltipContent>
															</Tooltip>
														</TooltipProvider>
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8"
																		onClick={() => setEditingKey(entry)}
																		disabled={!natsConnected}
																	>
																		<Edit className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Edit</TooltipContent>
															</Tooltip>
														</TooltipProvider>
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8"
																		onClick={() => setShowHistory(entry.key)}
																	>
																		<History className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>History</TooltipContent>
															</Tooltip>
														</TooltipProvider>
														<TooltipProvider>
															<Tooltip>
																<TooltipTrigger asChild>
																	<Button
																		variant="ghost"
																		size="icon"
																		className="h-8 w-8 text-destructive hover:text-destructive"
																		onClick={() => handleDelete(entry.key)}
																		disabled={!natsConnected}
																	>
																		<Trash2 className="h-4 w-4" />
																	</Button>
																</TooltipTrigger>
																<TooltipContent>Delete</TooltipContent>
															</Tooltip>
														</TooltipProvider>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						) : (
							<div className="text-center py-8 text-muted-foreground">
								{searchQuery ? "No keys match your search" : "No keys in this bucket"}
							</div>
						)}
					</CardContent>
				</Card>
			</div>

			{/* Add/Edit Key Dialog */}
			<KeyDialog
				editingKey={editingKey || undefined}
				open={showAddDialog || !!editingKey}
				onOpenChange={(open) => {
					if (!open) {
						setShowAddDialog(false);
						setEditingKey(null);
					}
				}}
				onSave={handlePutKey}
			/>

			{/* View Key Dialog */}
			<ViewKeyDialog
				entry={viewingKey}
				open={!!viewingKey}
				onOpenChange={(open) => !open && setViewingKey(null)}
				onCopy={copyToClipboard}
			/>

			{/* History Dialog */}
			<HistoryDialog
				keyName={showHistory}
				history={keyHistory}
				open={!!showHistory}
				onOpenChange={(open) => !open && setShowHistory(null)}
			/>
		</>
	);
}

// Key Add/Edit Dialog Component
function KeyDialog({
	editingKey,
	open,
	onOpenChange,
	onSave,
}: {
	editingKey?: LocalKvEntry;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSave: (key: string, value: string) => Promise<void>;
}) {
	const [key, setKey] = useState("");
	const [value, setValue] = useState("");
	const [error, setError] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (editingKey) {
			setKey(editingKey.key);
			setValue(editingKey.value);
		} else {
			setKey("");
			setValue("");
		}
		setError("");
	}, [editingKey, open]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!key.trim()) {
			setError("Key is required");
			return;
		}

		setIsSaving(true);
		try {
			await onSave(key, value);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save key");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{editingKey ? "Edit Key" : "Add Key"}</DialogTitle>
					<DialogDescription>
						{editingKey ? `Update the value for "${editingKey.key}"` : "Add a new key-value pair"}
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="key">Key</Label>
						<Input
							id="key"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							placeholder="my.key.name"
							disabled={!!editingKey}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="value">Value</Label>
						<Textarea
							id="value"
							value={value}
							onChange={(e) => setValue(e.target.value)}
							placeholder="Value..."
							rows={6}
							className="font-mono text-sm"
						/>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isSaving}>
							{isSaving ? "Saving..." : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

// View Key Dialog Component
function ViewKeyDialog({
	entry,
	open,
	onOpenChange,
	onCopy,
}: {
	entry: LocalKvEntry | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCopy: (text: string) => void;
}) {
	const [showRaw, setShowRaw] = useState(false);

	if (!entry) return null;

	// Try to parse as JSON for pretty printing
	let formattedValue = entry.value;
	let isJson = false;
	try {
		const parsed = JSON.parse(entry.value);
		formattedValue = JSON.stringify(parsed, null, 2);
		isJson = true;
	} catch {
		// Not JSON, use raw value
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Key className="h-4 w-4" />
						{entry.key}
					</DialogTitle>
					<DialogDescription>
						Revision {entry.revision} • {formatDate(entry.created)}
					</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-auto">
					<div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-2">
							{isJson && (
								<Button variant="ghost" size="sm" onClick={() => setShowRaw(!showRaw)}>
									{showRaw ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
									{showRaw ? "Pretty" : "Raw"}
								</Button>
							)}
						</div>
						<Button variant="ghost" size="sm" onClick={() => onCopy(entry.value)}>
							<Copy className="h-4 w-4 mr-1" />
							Copy
						</Button>
					</div>
					<pre className="bg-muted p-4 rounded-md overflow-auto text-sm font-mono whitespace-pre-wrap break-all">
						{showRaw || !isJson ? entry.value : formattedValue}
					</pre>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// History Dialog Component
function HistoryDialog({
	keyName,
	history,
	open,
	onOpenChange,
}: {
	keyName: string | null;
	history?: KvEntry[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	if (!keyName) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<History className="h-4 w-4" />
						History: {keyName}
					</DialogTitle>
					<DialogDescription>Previous revisions of this key</DialogDescription>
				</DialogHeader>

				<div className="flex-1 overflow-auto">
					{history && history.length > 0 ? (
						<div className="space-y-3">
							{history.map((entry, i) => (
								<div
									key={entry.revision}
									className={cn("border rounded-md p-3", i === 0 && "border-primary")}
								>
									<div className="flex items-center justify-between mb-2">
										<div className="flex items-center gap-2">
											<Badge variant={i === 0 ? "default" : "outline"}>r{entry.revision}</Badge>
											<Badge variant={entry.operation === "PUT" ? "secondary" : "destructive"}>
												{entry.operation}
											</Badge>
										</div>
										<span className="text-xs text-muted-foreground">
											{formatDate(entry.created)}
										</span>
									</div>
									{entry.operation === "PUT" && (
										<pre className="bg-muted p-2 rounded text-xs font-mono overflow-auto max-h-24">
											{entry.value}
										</pre>
									)}
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-8 text-muted-foreground">No history available</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
