import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Database,
	HardDrive,
	Layers,
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
	DropdownMenuSeparator,
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { clustersApi, streamsApi } from "@/lib/api";
import { CreateStreamDialog } from "@/components/streams/create-stream-dialog";

export const Route = createFileRoute("/_app/streams/")({
	component: StreamsPage,
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

function StreamsPage() {
	const queryClient = useQueryClient();
	const [selectedCluster, setSelectedCluster] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data: clusters, isLoading: loadingClusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
	})

	const { data: streams, isLoading: loadingStreams, refetch, isFetching } = useQuery({
		queryKey: ["streams", selectedCluster],
		queryFn: () => streamsApi.list(selectedCluster),
		enabled: !!selectedCluster,
	})

	const filteredStreams = streams?.filter((stream) =>
		stream.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		stream.subjects.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()))
	)

	const handleDelete = async (name: string) => {
		if (!selectedCluster) return;
		if (!confirm(`Are you sure you want to delete stream "${name}"? This action cannot be undone.`)) {
			return
		}

		try {
			await streamsApi.delete(selectedCluster, name);
			queryClient.invalidateQueries({ queryKey: ["streams", selectedCluster] });
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to delete stream");
		}
	}

	const handlePurge = async (name: string) => {
		if (!selectedCluster) return;
		if (!confirm(`Are you sure you want to purge all messages from stream "${name}"?`)) {
			return
		}

		try {
			const result = await streamsApi.purge(selectedCluster, name);
			alert(`Purged ${result.purged} messages`);
			queryClient.invalidateQueries({ queryKey: ["streams", selectedCluster] });
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to purge stream");
		}
	}

	// Auto-select first cluster
	if (clusters && clusters.length > 0 && !selectedCluster) {
		setSelectedCluster(clusters[0].id);
	}

	return (
		<>
			<AppHeader title="Streams">
				{selectedCluster && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => refetch()}
						disabled={isFetching}
					>
						<RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
						Refresh
					</Button>
				)}
			</AppHeader>
			<div className="flex flex-1 flex-col gap-4 p-4">
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
									placeholder="Search streams..."
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
							Create Stream
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
								You need to add a cluster before you can manage streams.
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
				) : loadingStreams ? (
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
				) : filteredStreams && filteredStreams.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>Streams ({filteredStreams.length})</CardTitle>
							<CardDescription>
								JetStream streams in the selected cluster
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Subjects</TableHead>
										<TableHead className="text-right">Messages</TableHead>
										<TableHead className="text-right">Size</TableHead>
										<TableHead className="text-right">Consumers</TableHead>
										<TableHead>Storage</TableHead>
										<TableHead className="w-[50px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredStreams.map((stream) => (
										<TableRow key={stream.name} className="group relative">
											<TableCell className="font-medium">
												<Link
													to="/streams/$clusterId/$name"
													params={{ clusterId: selectedCluster, name: stream.name }}
													className="hover:underline after:absolute after:inset-0 after:content-['']"
												>
													{stream.name}
												</Link>
											</TableCell>
											<TableCell>
												<div className="flex flex-wrap gap-1">
													{stream.subjects.slice(0, 3).map((subject) => (
														<Badge key={subject} variant="secondary" className="text-xs">
															{subject}
														</Badge>
													))}
													{stream.subjects.length > 3 && (
														<Badge variant="outline" className="text-xs">
															+{stream.subjects.length - 3}
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatNumber(stream.state.messages)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatBytes(stream.state.bytes)}
											</TableCell>
											<TableCell className="text-right">
												{stream.state.consumerCount}
											</TableCell>
											<TableCell>
												<Badge variant={stream.storage === "file" ? "default" : "secondary"}>
													{stream.storage === "file" ? (
														<HardDrive className="h-3 w-3 mr-1" />
													) : (
														<Database className="h-3 w-3 mr-1" />
													)}
													{stream.storage}
												</Badge>
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
																to="/streams/$clusterId/$name"
																params={{ clusterId: selectedCluster, name: stream.name }}
															>
																<Layers className="mr-2 h-4 w-4" />
																View Details
															</Link>
														</DropdownMenuItem>
														<DropdownMenuItem onClick={() => handlePurge(stream.name)}>
															<RefreshCw className="mr-2 h-4 w-4" />
															Purge Messages
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => handleDelete(stream.name)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete Stream
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
				) : selectedCluster ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Layers className="h-5 w-5" />
								No Streams Found
							</CardTitle>
							<CardDescription>
								{searchQuery
									? "No streams match your search criteria"
									: "This cluster doesn't have any streams yet"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!searchQuery && (
								<Button onClick={() => setShowCreateDialog(true)}>
									<Plus className="h-4 w-4 mr-2" />
									Create Your First Stream
								</Button>
							)}
						</CardContent>
					</Card>
				) : null}
			</div>

			{selectedCluster && (
				<CreateStreamDialog
					clusterId={selectedCluster}
					open={showCreateDialog}
					onOpenChange={setShowCreateDialog}
				/>
			)}
		</>
	)
}
