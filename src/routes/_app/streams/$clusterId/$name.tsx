import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Database,
	HardDrive,
	Layers,
	Pause,
	Play,
	Radio,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { connect, type NatsConnection, type Subscription } from "nats.ws";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clustersApi, streamsApi } from "@/lib/api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/streams/$clusterId/$name")({
	component: StreamDetailPage,
});

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

function formatDuration(nanos: number): string {
	if (nanos === 0) return "No limit";
	const seconds = nanos / 1_000_000_000;
	if (seconds < 60) return `${seconds}s`;
	const minutes = seconds / 60;
	if (minutes < 60) return `${minutes.toFixed(0)}m`;
	const hours = minutes / 60;
	if (hours < 24) return `${hours.toFixed(0)}h`;
	const days = hours / 24;
	return `${days.toFixed(0)}d`;
}

function formatDate(dateStr: string): string {
	if (!dateStr) return "N/A";
	const date = new Date(dateStr);
	return date.toLocaleString();
}

interface LiveMessage {
	seq: number;
	subject: string;
	data: string;
	time: string;
	isNew?: boolean;
}

function StreamDetailPage() {
	const { clusterId, name } = Route.useParams();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [currentSeq, setCurrentSeq] = useState<number | undefined>(undefined);
	const [activeTab, setActiveTab] = useState("messages");

	// Live streaming state
	const [isStreaming, setIsStreaming] = useState(false);
	const [liveMessages, setLiveMessages] = useState<LiveMessage[]>([]);
	const [natsConnected, setNatsConnected] = useState(false);
	const [streamError, setStreamError] = useState<string | null>(null);
	const ncRef = useRef<NatsConnection | null>(null);
	const subsRef = useRef<Subscription[]>([]);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const msgCounterRef = useRef(0);

	const { data: cluster } = useQuery({
		queryKey: ["cluster", clusterId],
		queryFn: () => clustersApi.getById(clusterId),
	});

	const {
		data: stream,
		isLoading,
		error,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["stream", clusterId, name],
		queryFn: () => streamsApi.get(clusterId, name),
	});

	const {
		data: messagesData,
		isLoading: loadingMessages,
		refetch: refetchMessages,
	} = useQuery({
		queryKey: ["stream-messages", clusterId, name, currentSeq],
		queryFn: () => streamsApi.getMessages(clusterId, name, currentSeq, 25),
		enabled: !!stream,
	});

	// Initialize currentSeq when stream loads
	if (stream && currentSeq === undefined && stream.state.firstSeq > 0) {
		setCurrentSeq(stream.state.firstSeq);
	}

	// NATS connection for live streaming
	const connectNats = useCallback(async () => {
		if (ncRef.current) return;
		if (!stream) return;

		setStreamError(null);

		try {
			// Get connection info from API
			const connInfo = await clustersApi.getConnectionInfo(clusterId);

			// Check for mixed content issues
			const isSecurePage = window.location.protocol === 'https:';
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
				timeout: 10000,
			};

			if (connInfo.authType === "token" && connInfo.token) {
				opts.token = connInfo.token;
			} else if (connInfo.authType === "userpass" && connInfo.username && connInfo.password) {
				opts.user = connInfo.username;
				opts.pass = connInfo.password;
			}

			// Connect to NATS
			const nc = await connect(opts);
			ncRef.current = nc;
			setNatsConnected(true);

			// Monitor connection status
			(async () => {
				for await (const status of nc.status()) {
					if (status.type === "disconnect" || status.type === "error") {
						setNatsConnected(false);
						if (status.type === "error") {
							setStreamError(`Connection error: ${status.data}`);
						}
					} else if (status.type === "reconnect") {
						setNatsConnected(true);
						setStreamError(null);
					}
				}
			})();

			// Subscribe to stream subjects
			const subjects = stream.subjects || [];
			for (const subject of subjects) {
				const sub = nc.subscribe(subject, {
					callback: (_err, msg) => {
						msgCounterRef.current++;
						const newMsg: LiveMessage = {
							seq: msgCounterRef.current,
							subject: msg.subject,
							data: new TextDecoder().decode(msg.data),
							time: new Date().toISOString(),
							isNew: true,
						};

						setLiveMessages((prev) => [...prev, newMsg].slice(-100));

						// Remove "new" flag after animation
						setTimeout(() => {
							setLiveMessages((prev) =>
								prev.map((m) =>
									m.seq === newMsg.seq ? { ...m, isNew: false } : m
								)
							);
						}, 1000);
					},
				});
				subsRef.current.push(sub);
			}
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

			setStreamError(errorMessage);
			setNatsConnected(false);
		}
	}, [clusterId, stream]);

	const disconnectNats = useCallback(async () => {
		// Unsubscribe all
		for (const sub of subsRef.current) {
			sub.unsubscribe();
		}
		subsRef.current = [];

		// Close connection
		if (ncRef.current) {
			await ncRef.current.close().catch(() => {});
			ncRef.current = null;
		}
		setNatsConnected(false);
	}, []);

	const toggleStreaming = () => {
		if (isStreaming) {
			disconnectNats();
			setIsStreaming(false);
		} else {
			connectNats();
			setIsStreaming(true);
		}
	};

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		if (messagesEndRef.current && isStreaming) {
			messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
		}
	}, [liveMessages, isStreaming]);

	// Cleanup NATS connection on unmount
	useEffect(() => {
		return () => {
			disconnectNats();
		};
	}, [disconnectNats]);

	const handlePurge = async () => {
		if (!confirm(`Are you sure you want to purge all messages from stream "${name}"?`)) {
			return;
		}

		try {
			const result = await streamsApi.purge(clusterId, name);
			alert(`Purged ${result.purged} messages`);
			queryClient.invalidateQueries({ queryKey: ["stream", clusterId, name] });
			queryClient.invalidateQueries({ queryKey: ["stream-messages", clusterId, name] });
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to purge stream");
		}
	};

	const handleDelete = async () => {
		if (!confirm(`Are you sure you want to delete stream "${name}"? This action cannot be undone.`)) {
			return;
		}

		try {
			await streamsApi.delete(clusterId, name);
			navigate({ to: "/streams" });
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete stream");
		}
	};

	const goToPrevPage = () => {
		if (messagesData && messagesData.messages.length > 0) {
			const firstMsgSeq = messagesData.messages[0].seq;
			const newSeq = Math.max(messagesData.firstSeq, firstMsgSeq - 25);
			setCurrentSeq(newSeq);
		}
	};

	const goToNextPage = () => {
		if (messagesData && messagesData.messages.length > 0) {
			const lastMsgSeq = messagesData.messages[messagesData.messages.length - 1].seq;
			if (lastMsgSeq < messagesData.lastSeq) {
				setCurrentSeq(lastMsgSeq + 1);
			}
		}
	};

	const hasPrevPage = messagesData && messagesData.messages.length > 0 &&
		messagesData.messages[0].seq > messagesData.firstSeq;
	const hasNextPage = messagesData?.hasMore;

	if (error) {
		return (
			<>
				<AppHeader
					title={name}
					breadcrumbs={[
						{ label: "Streams", href: "/streams" },
						{ label: name },
					]}
				/>
				<div className="page-content">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircle className="h-5 w-5" />
								Error Loading Stream
							</CardTitle>
							<CardDescription>
								{error instanceof Error ? error.message : "Failed to load stream"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild variant="outline">
								<Link to="/streams">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Back to Streams
								</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</>
		);
	}

	return (
		<>
			<AppHeader
				title={name}
				breadcrumbs={[
					{ label: "Streams", href: "/streams" },
					{ label: cluster?.name || clusterId, href: "/streams" },
					{ label: name },
				]}
			>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetch()}
					disabled={isFetching}
				>
					<RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
					Refresh
				</Button>
			</AppHeader>

			<div className="page-content">
				{isLoading ? (
					<>
						<div className="grid gap-4 md:grid-cols-4">
							{[...Array(4)].map((_, i) => (
								<Card key={i}>
									<CardHeader className="pb-2">
										<Skeleton className="h-4 w-20" />
									</CardHeader>
									<CardContent>
										<Skeleton className="h-8 w-24" />
									</CardContent>
								</Card>
							))}
						</div>
						<Card>
							<CardHeader>
								<Skeleton className="h-6 w-32" />
							</CardHeader>
							<CardContent className="space-y-2">
								<Skeleton className="h-10 w-full" />
								<Skeleton className="h-10 w-full" />
							</CardContent>
						</Card>
					</>
				) : stream ? (
					<>
						{/* Stats Cards */}
						<div className="grid gap-4 md:grid-cols-4">
							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Messages</CardTitle>
									<Layers className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatNumber(stream.state.messages)}
									</div>
									<p className="text-xs text-muted-foreground">
										Seq: {stream.state.firstSeq} - {stream.state.lastSeq}
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Size</CardTitle>
									{stream.storage === "file" ? (
										<HardDrive className="h-4 w-4 text-muted-foreground" />
									) : (
										<Database className="h-4 w-4 text-muted-foreground" />
									)}
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatBytes(stream.state.bytes)}
									</div>
									<p className="text-xs text-muted-foreground">
										{stream.storage} storage
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Consumers</CardTitle>
									<Layers className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{stream.state.consumerCount}
									</div>
									<p className="text-xs text-muted-foreground">
										Active consumers
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Created</CardTitle>
									<Calendar className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-sm font-medium">
										{formatDate(stream.created)}
									</div>
								</CardContent>
							</Card>
						</div>

						{/* Tabs */}
						<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
							<TabsList>
								<TabsTrigger value="messages">Messages</TabsTrigger>
								<TabsTrigger value="live" className="gap-2">
									<Radio className={cn("h-3 w-3", isStreaming && natsConnected && "text-green-500 animate-pulse")} />
									Live
								</TabsTrigger>
								<TabsTrigger value="config">Configuration</TabsTrigger>
								<TabsTrigger value="danger">Danger Zone</TabsTrigger>
							</TabsList>

							<TabsContent value="messages" className="space-y-4">
								<Card>
									<CardHeader className="flex flex-row items-center justify-between">
										<div>
											<CardTitle>Message Browser</CardTitle>
											<CardDescription>
												Browse historical messages in this stream
											</CardDescription>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant="outline"
												size="sm"
												onClick={goToPrevPage}
												disabled={!hasPrevPage || loadingMessages}
											>
												<ChevronLeft className="h-4 w-4" />
											</Button>
											<span className="text-sm text-muted-foreground">
												{messagesData?.messages.length || 0} messages
											</span>
											<Button
												variant="outline"
												size="sm"
												onClick={goToNextPage}
												disabled={!hasNextPage || loadingMessages}
											>
												<ChevronRight className="h-4 w-4" />
											</Button>
											<Button
												variant="outline"
												size="sm"
												onClick={() => refetchMessages()}
												disabled={loadingMessages}
											>
												<RefreshCw className={`h-4 w-4 ${loadingMessages ? "animate-spin" : ""}`} />
											</Button>
										</div>
									</CardHeader>
									<CardContent>
										{loadingMessages ? (
											<div className="space-y-2">
												<Skeleton className="h-10 w-full" />
												<Skeleton className="h-10 w-full" />
												<Skeleton className="h-10 w-full" />
											</div>
										) : messagesData && messagesData.messages.length > 0 ? (
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead className="w-[80px]">Seq</TableHead>
														<TableHead className="w-[200px]">Subject</TableHead>
														<TableHead className="w-[180px]">Time</TableHead>
														<TableHead>Data</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{messagesData.messages.map((msg) => (
														<TableRow key={msg.seq}>
															<TableCell className="font-mono text-sm">
																{msg.seq}
															</TableCell>
															<TableCell>
																<Badge variant="outline" className="font-mono text-xs">
																	{msg.subject}
																</Badge>
															</TableCell>
															<TableCell className="text-xs text-muted-foreground">
																{formatDate(msg.time)}
															</TableCell>
															<TableCell className="font-mono text-xs max-w-[400px] truncate">
																{msg.data}
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										) : (
											<div className="text-center py-8 text-muted-foreground">
												No messages in this stream
											</div>
										)}
									</CardContent>
								</Card>
							</TabsContent>

							<TabsContent value="live" className="space-y-4">
								<Card>
									<CardHeader className="flex flex-row items-center justify-between">
										<div>
											<CardTitle className="flex items-center gap-2">
												Live Messages
												{isStreaming && natsConnected && (
													<span className="relative flex h-2 w-2">
														<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
														<span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
													</span>
												)}
											</CardTitle>
											<CardDescription>
												{streamError ? (
													<span className="text-destructive">{streamError}</span>
												) : isStreaming ? (
													natsConnected
														? `Watching subjects: ${stream?.subjects?.join(", ") || "..."}`
														: "Connecting to NATS..."
												) : (
													"Click Start to watch for new messages in real-time"
												)}
											</CardDescription>
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant={isStreaming ? "destructive" : "default"}
												size="sm"
												onClick={toggleStreaming}
											>
												{isStreaming ? (
													<>
														<Pause className="h-4 w-4 mr-2" />
														Stop
													</>
												) : (
													<>
														<Play className="h-4 w-4 mr-2" />
														Start
													</>
												)}
											</Button>
											{liveMessages.length > 0 && (
												<Button
													variant="outline"
													size="sm"
													onClick={() => setLiveMessages([])}
												>
													Clear
												</Button>
											)}
										</div>
									</CardHeader>
									<CardContent>
										<div className="max-h-[500px] overflow-y-auto">
											{liveMessages.length > 0 ? (
												<Table>
													<TableHeader>
														<TableRow>
															<TableHead className="w-[80px]">Seq</TableHead>
															<TableHead className="w-[200px]">Subject</TableHead>
															<TableHead className="w-[180px]">Time</TableHead>
															<TableHead>Data</TableHead>
														</TableRow>
													</TableHeader>
													<TableBody>
														{liveMessages.map((msg) => (
															<TableRow
																key={msg.seq}
																className={cn(
																	"transition-colors duration-500",
																	msg.isNew && "bg-green-500/10 animate-pulse"
																)}
															>
																<TableCell className="font-mono text-sm">
																	{msg.seq}
																</TableCell>
																<TableCell>
																	<Badge variant="outline" className="font-mono text-xs">
																		{msg.subject}
																	</Badge>
																</TableCell>
																<TableCell className="text-xs text-muted-foreground">
																	{formatDate(msg.time)}
																</TableCell>
																<TableCell className="font-mono text-xs max-w-[400px] truncate">
																	{msg.data}
																</TableCell>
															</TableRow>
														))}
													</TableBody>
												</Table>
											) : (
												<div className="text-center py-8 text-muted-foreground">
													{isStreaming
														? "Waiting for new messages..."
														: "No live messages yet. Click Start to begin watching."}
												</div>
											)}
											<div ref={messagesEndRef} />
										</div>
									</CardContent>
								</Card>
							</TabsContent>

							<TabsContent value="config" className="space-y-4">
								<Card>
									<CardHeader>
										<CardTitle>Stream Configuration</CardTitle>
										<CardDescription>
											Current configuration for this stream
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="grid gap-4 md:grid-cols-2">
											<div className="space-y-4">
												<div>
													<div className="text-sm font-medium">Subjects</div>
													<div className="flex flex-wrap gap-1 mt-1">
														{stream.subjects.map((subject) => (
															<Badge key={subject} variant="secondary">
																{subject}
															</Badge>
														))}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Description</div>
													<div className="text-sm text-muted-foreground">
														{stream.description || "No description"}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Retention Policy</div>
													<div className="text-sm text-muted-foreground capitalize">
														{stream.retention}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Discard Policy</div>
													<div className="text-sm text-muted-foreground capitalize">
														{stream.discard}
													</div>
												</div>
											</div>

											<div className="space-y-4">
												<div>
													<div className="text-sm font-medium">Max Messages</div>
													<div className="text-sm text-muted-foreground">
														{stream.maxMsgs === -1 ? "Unlimited" : formatNumber(stream.maxMsgs)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Max Bytes</div>
													<div className="text-sm text-muted-foreground">
														{stream.maxBytes === -1 ? "Unlimited" : formatBytes(stream.maxBytes)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Max Age</div>
													<div className="text-sm text-muted-foreground">
														{formatDuration(stream.maxAge)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Max Message Size</div>
													<div className="text-sm text-muted-foreground">
														{stream.maxMsgSize === -1 ? "Unlimited" : formatBytes(stream.maxMsgSize)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Replicas</div>
													<div className="text-sm text-muted-foreground">
														{stream.replicas}
													</div>
												</div>
											</div>
										</div>
									</CardContent>
								</Card>
							</TabsContent>

							<TabsContent value="danger" className="space-y-4">
								<Card className="border-destructive/50">
									<CardHeader>
										<CardTitle className="text-destructive">Danger Zone</CardTitle>
										<CardDescription>
											These actions are destructive and cannot be undone.
										</CardDescription>
									</CardHeader>
									<CardContent className="space-y-4">
										<div className="flex items-center justify-between p-4 border rounded-lg">
											<div>
												<div className="font-medium">Purge All Messages</div>
												<div className="text-sm text-muted-foreground">
													Remove all messages from this stream. The stream configuration will be preserved.
												</div>
											</div>
											<Button variant="outline" onClick={handlePurge}>
												<RefreshCw className="h-4 w-4 mr-2" />
												Purge
											</Button>
										</div>

										<div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg">
											<div>
												<div className="font-medium text-destructive">Delete Stream</div>
												<div className="text-sm text-muted-foreground">
													Permanently delete this stream and all its messages.
												</div>
											</div>
											<Button variant="destructive" onClick={handleDelete}>
												<Trash2 className="h-4 w-4 mr-2" />
												Delete
											</Button>
										</div>
									</CardContent>
								</Card>
							</TabsContent>
						</Tabs>
					</>
				) : null}
			</div>
		</>
	);
}
