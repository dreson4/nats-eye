import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	FolderArchive,
	HardDrive,
	MemoryStick,
	MoreVertical,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import {
	connect,
	type NatsConnection,
	type JetStreamManager,
	StorageType,
} from "nats.ws";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { clustersApi } from "@/lib/api";

export const Route = createFileRoute("/_app/objectstore/")({
	component: ObjectStorePage,
});

interface BucketInfo {
	name: string;
	description?: string;
	size: number;
	storage: string;
	replicas: number;
	sealed: boolean;
	ttl: number;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function ObjectStorePage() {
	const [selectedCluster, setSelectedCluster] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const [natsConnected, setNatsConnected] = useState(false);
	const [connectionError, setConnectionError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [buckets, setBuckets] = useState<BucketInfo[]>([]);

	const ncRef = useRef<NatsConnection | null>(null);
	const isMountedRef = useRef(true);

	const { data: clusters, isLoading: loadingClusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
	});

	const connectToNats = useCallback(async (clusterId: string) => {
		// Disconnect existing connection
		if (ncRef.current) {
			await ncRef.current.close().catch(() => {});
			ncRef.current = null;
		}

		setConnectionError(null);
		setIsLoading(true);
		setBuckets([]);

		try {
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

			const nc = await connect(opts);
			if (!isMountedRef.current) {
				await nc.close();
				return;
			}

			ncRef.current = nc;
			setNatsConnected(true);

			// Load buckets
			await loadBuckets(nc);

			setIsLoading(false);
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
	}, []);

	const loadBuckets = async (nc: NatsConnection) => {
		try {
			const js = nc.jetstream();
			const jsm = await nc.jetstreamManager();
			const bucketList: BucketInfo[] = [];

			// List all streams and filter for object store backing streams
			for await (const stream of jsm.streams.list()) {
				if (stream.config.name.startsWith("OBJ_")) {
					const bucketName = stream.config.name.slice(4); // Remove "OBJ_" prefix
					try {
						const os = await js.views.os(bucketName);
						const status = await os.status();
						bucketList.push({
							name: status.bucket,
							description: status.description,
							size: status.size,
							storage: status.storage === StorageType.Memory ? "memory" : "file",
							replicas: status.replicas,
							sealed: status.sealed,
							ttl: status.ttl,
						});
					} catch {
						// Skip if we can't access the bucket
					}
				}
			}

			setBuckets(bucketList);
		} catch (err) {
			console.error("Failed to list buckets:", err);
		}
	};

	const disconnectFromNats = useCallback(() => {
		if (ncRef.current) {
			ncRef.current.close().catch(() => {});
			ncRef.current = null;
		}
		setNatsConnected(false);
		setBuckets([]);
	}, []);

	// Connect when cluster changes
	useEffect(() => {
		if (selectedCluster) {
			connectToNats(selectedCluster);
		}
	}, [selectedCluster, connectToNats]);

	// Cleanup on unmount
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
			disconnectFromNats();
		};
	}, [disconnectFromNats]);

	// Auto-select first cluster
	useEffect(() => {
		if (clusters && clusters.length > 0 && !selectedCluster) {
			setSelectedCluster(clusters[0].id);
		}
	}, [clusters, selectedCluster]);

	const filteredBuckets = buckets.filter((bucket) =>
		bucket.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const handleDelete = async (name: string) => {
		if (!ncRef.current) return;
		if (!confirm(`Are you sure you want to delete bucket "${name}"? This will delete all objects and cannot be undone.`)) {
			return;
		}

		try {
			const js = ncRef.current.jetstream();
			const os = await js.views.os(name);
			await os.destroy();
			await loadBuckets(ncRef.current);
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to delete bucket");
		}
	};

	const handleRefresh = async () => {
		if (!ncRef.current) {
			if (selectedCluster) {
				await connectToNats(selectedCluster);
			}
			return;
		}

		setIsLoading(true);
		await loadBuckets(ncRef.current);
		setIsLoading(false);
	};

	const handleCreateBucket = async (data: {
		name: string;
		description?: string;
		storage: "file" | "memory";
		replicas: number;
		ttl?: number;
		maxBucketSize?: number;
	}) => {
		if (!ncRef.current) return;

		try {
			const js = ncRef.current.jetstream();
			await js.views.os(data.name, {
				description: data.description,
				storage: data.storage === "memory" ? StorageType.Memory : StorageType.File,
				replicas: data.replicas,
				ttl: data.ttl,
				max_bytes: data.maxBucketSize,
			});
			await loadBuckets(ncRef.current);
			setShowCreateDialog(false);
		} catch (error) {
			throw error;
		}
	};

	return (
		<>
			<AppHeader title="Object Store">
				{selectedCluster && (
					<Button
						variant="outline"
						size="sm"
						onClick={handleRefresh}
						disabled={isLoading}
					>
						<RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				)}
			</AppHeader>
			<div className="page-content">
				{/* Header with cluster selector and actions */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select
							value={selectedCluster}
							onValueChange={setSelectedCluster}
							disabled={loadingClusters || !clusters?.length}
						>
							<SelectTrigger className="w-[250px]">
								<SelectValue placeholder="Select a cluster" />
							</SelectTrigger>
							<SelectContent>
								{clusters?.map((cluster) => (
									<SelectItem key={cluster.id} value={cluster.id}>
										{cluster.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>

						{selectedCluster && (
							<div className="relative">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search buckets..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-8 w-[200px]"
								/>
							</div>
						)}

						{natsConnected && (
							<Badge variant="outline" className="text-green-600">
								Connected
							</Badge>
						)}
					</div>

					{selectedCluster && natsConnected && (
						<Button onClick={() => setShowCreateDialog(true)}>
							<Plus className="h-4 w-4 mr-2" />
							Create Bucket
						</Button>
					)}
				</div>

				{/* Content */}
				{!clusters?.length && !loadingClusters ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<AlertCircle className="h-5 w-5" />
								No Clusters Available
							</CardTitle>
							<CardDescription>
								You need to add a cluster before you can manage object store buckets.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild>
								<Link to="/clusters">
									<Plus className="h-4 w-4 mr-2" />
									Add Cluster
								</Link>
							</Button>
						</CardContent>
					</Card>
				) : connectionError ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircle className="h-5 w-5" />
								Connection Error
							</CardTitle>
							<CardDescription>{connectionError}</CardDescription>
						</CardHeader>
						<CardContent>
							<Button variant="outline" onClick={() => selectedCluster && connectToNats(selectedCluster)}>
								<RefreshCw className="h-4 w-4 mr-2" />
								Retry
							</Button>
						</CardContent>
					</Card>
				) : isLoading ? (
					<Card>
						<CardHeader>
							<Skeleton className="h-6 w-32" />
						</CardHeader>
						<CardContent className="space-y-2">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</CardContent>
					</Card>
				) : filteredBuckets.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>Object Store Buckets ({filteredBuckets.length})</CardTitle>
							<CardDescription>
								Object store buckets for file storage in the selected cluster
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead className="text-right">Size</TableHead>
										<TableHead>Storage</TableHead>
										<TableHead className="text-center">Replicas</TableHead>
										<TableHead>Status</TableHead>
										<TableHead className="w-[50px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredBuckets.map((bucket) => (
										<TableRow key={bucket.name} className="group relative">
											<TableCell className="font-medium">
												<Link
													to="/objectstore/$clusterId/$bucket"
													params={{ clusterId: selectedCluster, bucket: bucket.name }}
													className="flex items-center gap-2 after:absolute after:inset-0 after:content-['']"
												>
													<FolderArchive className="h-4 w-4 text-primary" />
													{bucket.name}
												</Link>
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatBytes(bucket.size)}
											</TableCell>
											<TableCell>
												<Badge variant={bucket.storage === "file" ? "default" : "secondary"}>
													{bucket.storage === "file" ? (
														<HardDrive className="h-3 w-3 mr-1" />
													) : (
														<MemoryStick className="h-3 w-3 mr-1" />
													)}
													{bucket.storage}
												</Badge>
											</TableCell>
											<TableCell className="text-center">{bucket.replicas}</TableCell>
											<TableCell>
												{bucket.sealed ? (
													<Badge variant="secondary">Sealed</Badge>
												) : (
													<Badge variant="outline">Active</Badge>
												)}
											</TableCell>
											<TableCell className="relative z-10">
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" size="icon" className="h-8 w-8">
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem asChild>
															<Link
																to="/objectstore/$clusterId/$bucket"
																params={{ clusterId: selectedCluster, bucket: bucket.name }}
															>
																<FolderArchive className="mr-2 h-4 w-4" />
																View Objects
															</Link>
														</DropdownMenuItem>
														<DropdownMenuItem
															onClick={() => handleDelete(bucket.name)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete Bucket
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</CardContent>
					</Card>
				) : selectedCluster && natsConnected ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<FolderArchive className="h-5 w-5" />
								No Object Store Buckets Found
							</CardTitle>
							<CardDescription>
								{searchQuery
									? "No buckets match your search criteria"
									: "This cluster doesn't have any object store buckets yet"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!searchQuery && (
								<Button onClick={() => setShowCreateDialog(true)}>
									<Plus className="h-4 w-4 mr-2" />
									Create Your First Bucket
								</Button>
							)}
						</CardContent>
					</Card>
				) : null}
			</div>

			<CreateBucketDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
				onCreate={handleCreateBucket}
			/>
		</>
	);
}

// Create Bucket Dialog Component
function CreateBucketDialog({
	open,
	onOpenChange,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (data: {
		name: string;
		description?: string;
		storage: "file" | "memory";
		replicas: number;
		ttl?: number;
		maxBucketSize?: number;
	}) => Promise<void>;
}) {
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [storage, setStorage] = useState<"file" | "memory">("file");
	const [replicas, setReplicas] = useState("1");
	const [ttl, setTtl] = useState("");
	const [maxBucketSize, setMaxBucketSize] = useState("");
	const [error, setError] = useState("");
	const [isCreating, setIsCreating] = useState(false);

	const resetForm = () => {
		setName("");
		setDescription("");
		setStorage("file");
		setReplicas("1");
		setTtl("");
		setMaxBucketSize("");
		setError("");
	};

	const parseBytes = (value: string): number | undefined => {
		const trimmed = value.trim().toUpperCase();
		if (!trimmed) return undefined;

		const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/);
		if (!match) return Number(trimmed) || undefined;

		const num = parseFloat(match[1]);
		const unit = match[2] || "B";

		const multipliers: Record<string, number> = {
			B: 1,
			KB: 1024,
			MB: 1024 * 1024,
			GB: 1024 * 1024 * 1024,
			TB: 1024 * 1024 * 1024 * 1024,
		};

		return Math.floor(num * multipliers[unit]);
	};

	const parseDuration = (value: string): number | undefined => {
		const trimmed = value.trim().toLowerCase();
		if (!trimmed) return undefined;

		const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$/);
		if (!match) return Number(trimmed) * 1_000_000_000 || undefined;

		const num = parseFloat(match[1]);
		const unit = match[2] || "s";

		const multipliers: Record<string, number> = {
			s: 1_000_000_000,
			m: 60 * 1_000_000_000,
			h: 60 * 60 * 1_000_000_000,
			d: 24 * 60 * 60 * 1_000_000_000,
		};

		return Math.floor(num * multipliers[unit]);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!name.trim()) {
			setError("Bucket name is required");
			return;
		}

		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			setError("Name can only contain letters, numbers, underscores, and hyphens");
			return;
		}

		setIsCreating(true);
		try {
			await onCreate({
				name: name.trim(),
				description: description.trim() || undefined,
				storage,
				replicas: parseInt(replicas) || 1,
				ttl: parseDuration(ttl),
				maxBucketSize: parseBytes(maxBucketSize),
			});
			resetForm();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create bucket");
		} finally {
			setIsCreating(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) resetForm(); }}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Create Object Store Bucket</DialogTitle>
					<DialogDescription>
						Create a new Object Store bucket for file storage.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="name">Name *</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="my-bucket"
						/>
						<p className="text-xs text-muted-foreground">
							Letters, numbers, underscores, and hyphens only
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional description..."
							rows={2}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Storage</Label>
							<Select value={storage} onValueChange={(v) => setStorage(v as typeof storage)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="file">File</SelectItem>
									<SelectItem value="memory">Memory</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Replicas</Label>
							<Select value={replicas} onValueChange={setReplicas}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">1</SelectItem>
									<SelectItem value="3">3</SelectItem>
									<SelectItem value="5">5</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="ttl">TTL</Label>
							<Input
								id="ttl"
								value={ttl}
								onChange={(e) => setTtl(e.target.value)}
								placeholder="e.g. 1h, 7d"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="maxBucketSize">Max Size</Label>
							<Input
								id="maxBucketSize"
								value={maxBucketSize}
								onChange={(e) => setMaxBucketSize(e.target.value)}
								placeholder="e.g. 10GB"
							/>
						</div>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={isCreating}>
							{isCreating ? "Creating..." : "Create Bucket"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
