import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	Clock,
	Filter,
	Layers,
	MoreVertical,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	Users,
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
import { clustersApi, consumersApi, streamsApi } from "@/lib/api";
import { CreateConsumerDialog } from "@/components/consumers/create-consumer-dialog";

export const Route = createFileRoute("/_app/consumers/")({
	component: ConsumersPage,
});

function formatNumber(num: number): string {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

function ConsumersPage() {
	const queryClient = useQueryClient();
	const [selectedCluster, setSelectedCluster] = useState<string>("");
	const [selectedStream, setSelectedStream] = useState<string>("");
	const [searchQuery, setSearchQuery] = useState("");
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data: clusters, isLoading: loadingClusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
	});

	const { data: streams, isLoading: loadingStreams } = useQuery({
		queryKey: ["streams", selectedCluster],
		queryFn: () => streamsApi.list(selectedCluster),
		enabled: !!selectedCluster,
	});

	const { data: consumers, isLoading: loadingConsumers, refetch, isFetching } = useQuery({
		queryKey: ["consumers", selectedCluster, selectedStream],
		queryFn: () =>
			selectedStream
				? consumersApi.listByStream(selectedCluster, selectedStream)
				: consumersApi.listAll(selectedCluster),
		enabled: !!selectedCluster,
	});

	const filteredConsumers = consumers?.filter((consumer) =>
		consumer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
		consumer.stream.toLowerCase().includes(searchQuery.toLowerCase()) ||
		consumer.config.filterSubject?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const handleDelete = async (streamName: string, consumerName: string) => {
		if (!selectedCluster) return;
		if (!confirm(`Are you sure you want to delete consumer "${consumerName}"? This action cannot be undone.`)) {
			return;
		}

		try {
			await consumersApi.delete(selectedCluster, streamName, consumerName);
			queryClient.invalidateQueries({ queryKey: ["consumers", selectedCluster] });
		} catch (error) {
			alert(error instanceof Error ? error.message : "Failed to delete consumer");
		}
	};

	// Auto-select first cluster
	if (clusters && clusters.length > 0 && !selectedCluster) {
		setSelectedCluster(clusters[0].id);
	}

	return (
		<>
			<AppHeader title="Consumers">
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
				{/* Header with cluster/stream selectors and actions */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select
							value={selectedCluster}
							onValueChange={(v) => {
								setSelectedCluster(v);
								setSelectedStream("");
							}}
							disabled={loadingClusters || !clusters?.length}
						>
							<SelectTrigger className="w-[200px]">
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
							<Select
								value={selectedStream}
								onValueChange={setSelectedStream}
								disabled={loadingStreams}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue placeholder="All streams" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="">All streams</SelectItem>
									{streams?.map((stream) => (
										<SelectItem key={stream.name} value={stream.name}>
											{stream.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}

						{selectedCluster && (
							<div className="relative">
								<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
								<Input
									placeholder="Search consumers..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="pl-8 w-[200px]"
								/>
							</div>
						)}
					</div>

					{selectedCluster && selectedStream && (
						<Button onClick={() => setShowCreateDialog(true)}>
							<Plus className="h-4 w-4 mr-2" />
							Create Consumer
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
								You need to add a cluster before you can manage consumers.
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
				) : loadingConsumers ? (
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
				) : filteredConsumers && filteredConsumers.length > 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>Consumers ({filteredConsumers.length})</CardTitle>
							<CardDescription>
								{selectedStream
									? `Consumers for stream "${selectedStream}"`
									: "All JetStream consumers in the selected cluster"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Stream</TableHead>
										<TableHead>Filter</TableHead>
										<TableHead className="text-right">Pending</TableHead>
										<TableHead className="text-right">Ack Pending</TableHead>
										<TableHead className="text-right">Redelivered</TableHead>
										<TableHead>Ack Policy</TableHead>
										<TableHead className="w-[50px]" />
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredConsumers.map((consumer) => (
										<TableRow key={`${consumer.stream}-${consumer.name}`} className="group relative">
											<TableCell className="font-medium">
												<Link
													to="/consumers/$clusterId/$stream/$consumer"
													params={{
														clusterId: selectedCluster,
														stream: consumer.stream,
														consumer: consumer.name,
													}}
													className="hover:underline after:absolute after:inset-0 after:content-['']"
												>
													{consumer.name}
												</Link>
											</TableCell>
											<TableCell>
												<Badge variant="outline">{consumer.stream}</Badge>
											</TableCell>
											<TableCell>
												{consumer.config.filterSubject ? (
													<Badge variant="secondary" className="text-xs font-mono">
														{consumer.config.filterSubject}
													</Badge>
												) : consumer.config.filterSubjects?.length ? (
													<Badge variant="secondary" className="text-xs">
														{consumer.config.filterSubjects.length} subjects
													</Badge>
												) : (
													<span className="text-muted-foreground text-sm">All</span>
												)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatNumber(consumer.numPending)}
											</TableCell>
											<TableCell className="text-right font-mono">
												<span className={consumer.numAckPending > 0 ? "text-yellow-500" : ""}>
													{formatNumber(consumer.numAckPending)}
												</span>
											</TableCell>
											<TableCell className="text-right font-mono">
												<span className={consumer.numRedelivered > 0 ? "text-orange-500" : ""}>
													{formatNumber(consumer.numRedelivered)}
												</span>
											</TableCell>
											<TableCell>
												<Badge
													variant={consumer.config.ackPolicy === "explicit" ? "default" : "secondary"}
													className="text-xs"
												>
													{consumer.config.ackPolicy}
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
																to="/consumers/$clusterId/$stream/$consumer"
																params={{
																	clusterId: selectedCluster,
																	stream: consumer.stream,
																	consumer: consumer.name,
																}}
															>
																<Users className="mr-2 h-4 w-4" />
																View Details
															</Link>
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() => handleDelete(consumer.stream, consumer.name)}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete Consumer
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
								<Users className="h-5 w-5" />
								No Consumers Found
							</CardTitle>
							<CardDescription>
								{searchQuery
									? "No consumers match your search criteria"
									: selectedStream
										? `No consumers exist for stream "${selectedStream}"`
										: "This cluster doesn't have any consumers yet"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{!searchQuery && selectedStream && (
								<Button onClick={() => setShowCreateDialog(true)}>
									<Plus className="h-4 w-4 mr-2" />
									Create Your First Consumer
								</Button>
							)}
							{!searchQuery && !selectedStream && (
								<p className="text-sm text-muted-foreground">
									Select a stream to create a consumer
								</p>
							)}
						</CardContent>
					</Card>
				) : null}
			</div>

			{selectedCluster && selectedStream && (
				<CreateConsumerDialog
					clusterId={selectedCluster}
					streamName={selectedStream}
					open={showCreateDialog}
					onOpenChange={setShowCreateDialog}
				/>
			)}
		</>
	);
}
