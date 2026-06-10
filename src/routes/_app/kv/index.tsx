import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Database,
	HardDrive,
	Key,
	MoreVertical,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import { useState } from "react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
	GridCell,
	GridHead,
	GridHeaderRow,
	GridRow,
	GridTable,
} from "@/components/ui/grid-table";
import { clustersApi, kvApi } from "@/lib/api";
import { CreateKvBucketDialog } from "@/components/kv/create-bucket-dialog";

export const Route = createFileRoute("/_app/kv/")({
	component: KVPage,
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

function KVPage() {
	const queryClient = useQueryClient();
	const [selectedCluster, setSelectedCluster] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data: clusters, isLoading: loadingClusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
	});

	const {
		data: buckets,
		isLoading: loadingBuckets,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["kv-buckets", selectedCluster],
		queryFn: () => kvApi.listBuckets(selectedCluster),
		enabled: !!selectedCluster,
	});

	const filteredBuckets = buckets?.filter((bucket) =>
		bucket.name.toLowerCase().includes(searchQuery.toLowerCase()),
	);

	const handleDelete = async (name: string) => {
		if (!selectedCluster) return;
		if (
			!confirm(
				`Are you sure you want to delete bucket "${name}"? This will delete all keys and cannot be undone.`,
			)
		) {
			return;
		}

		try {
			await kvApi.deleteBucket(selectedCluster, name);
			queryClient.invalidateQueries({
				queryKey: ["kv-buckets", selectedCluster],
			});
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to delete bucket");
		}
	};

	// Auto-select first cluster
	if (clusters && clusters.length > 0 && !selectedCluster) {
		setSelectedCluster(clusters[0].id);
	}

	return (
		<>
			<AppHeader title="KV Store">
				{selectedCluster && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => refetch()}
						disabled={isFetching}
					>
						<RefreshCw
							className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
						/>
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
					</div>

					{selectedCluster && (
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
								You need to add a cluster before you can manage KV buckets.
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
				) : loadingBuckets ? (
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
				) : filteredBuckets && filteredBuckets.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>KV Buckets ({filteredBuckets.length})</CardTitle>
							<CardDescription>
								Key-Value buckets in the selected cluster
							</CardDescription>
						</CardHeader>
						<CardContent>
							<GridTable
								cols="grid-cols-[minmax(160px,2fr)_minmax(72px,1fr)_minmax(88px,1fr)_minmax(80px,1fr)_minmax(110px,1fr)_50px]"
								className="min-w-[560px]"
							>
								<GridHeaderRow>
									<GridHead>Name</GridHead>
									<GridHead className="justify-end">Keys</GridHead>
									<GridHead className="justify-end">Size</GridHead>
									<GridHead className="justify-end">History</GridHead>
									<GridHead>Storage</GridHead>
									<GridHead />
								</GridHeaderRow>
								{filteredBuckets.map((bucket) => (
									<GridRow key={bucket.name}>
										<GridCell className="font-medium">
											<Link
												to="/kv/$clusterId/$bucket"
												params={{
													clusterId: selectedCluster,
													bucket: bucket.name,
												}}
												className="flex items-center gap-2 after:absolute after:inset-0 after:content-['']"
											>
												<Database className="h-4 w-4 text-primary" />
												{bucket.name}
											</Link>
										</GridCell>
										<GridCell className="text-right font-mono">
											{formatNumber(bucket.values)}
										</GridCell>
										<GridCell className="text-right font-mono">
											{formatBytes(bucket.size)}
										</GridCell>
										<GridCell className="text-right">{bucket.history}</GridCell>
										<GridCell>
											<Badge
												variant={
													bucket.storage === "file" ? "default" : "secondary"
												}
											>
												{bucket.storage === "file" ? (
													<HardDrive className="h-3 w-3 mr-1" />
												) : (
													<Database className="h-3 w-3 mr-1" />
												)}
												{bucket.storage}
											</Badge>
										</GridCell>
										<GridCell className="relative z-10">
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
													>
														<MoreVertical className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem asChild>
														<Link
															to="/kv/$clusterId/$bucket"
															params={{
																clusterId: selectedCluster,
																bucket: bucket.name,
															}}
														>
															<Key className="mr-2 h-4 w-4" />
															View Keys
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
										</GridCell>
									</GridRow>
								))}
							</GridTable>
						</CardContent>
					</Card>
				) : selectedCluster ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Database className="h-5 w-5" />
								No KV Buckets Found
							</CardTitle>
							<CardDescription>
								{searchQuery
									? "No buckets match your search criteria"
									: "This cluster doesn't have any KV buckets yet"}
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

			{selectedCluster && (
				<CreateKvBucketDialog
					clusterId={selectedCluster}
					open={showCreateDialog}
					onOpenChange={setShowCreateDialog}
				/>
			)}
		</>
	);
}
