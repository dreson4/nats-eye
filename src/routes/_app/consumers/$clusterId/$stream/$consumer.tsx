import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	Clock,
	Filter,
	Layers,
	RefreshCw,
	Trash2,
	Users,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clustersApi, consumersApi } from "@/lib/api";

export const Route = createFileRoute("/_app/consumers/$clusterId/$stream/$consumer")({
	component: ConsumerDetailPage,
});

function formatNumber(num: number): string {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

function formatDate(dateStr: string): string {
	if (!dateStr) return "N/A";
	const date = new Date(dateStr);
	return date.toLocaleString();
}

function formatDuration(nanos: number | undefined): string {
	if (!nanos || nanos === 0) return "Default";
	const ms = nanos / 1_000_000;
	if (ms < 1000) return `${ms.toFixed(0)}ms`;
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = seconds / 60;
	if (minutes < 60) return `${minutes.toFixed(0)}m`;
	const hours = minutes / 60;
	return `${hours.toFixed(1)}h`;
}

function ConsumerDetailPage() {
	const { clusterId, stream, consumer: consumerName } = Route.useParams();
	const queryClient = useQueryClient();
	const navigate = useNavigate();

	const { data: cluster } = useQuery({
		queryKey: ["cluster", clusterId],
		queryFn: () => clustersApi.getById(clusterId),
	});

	const {
		data: consumer,
		isLoading,
		error,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["consumer", clusterId, stream, consumerName],
		queryFn: () => consumersApi.get(clusterId, stream, consumerName),
		refetchInterval: 5000, // Auto-refresh every 5 seconds for real-time stats
	});

	const handleDelete = async () => {
		if (!confirm(`Are you sure you want to delete consumer "${consumerName}"? This action cannot be undone.`)) {
			return;
		}

		try {
			await consumersApi.delete(clusterId, stream, consumerName);
			navigate({ to: "/consumers" });
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete consumer");
		}
	};

	if (error) {
		return (
			<>
				<AppHeader
					title={consumerName}
					breadcrumbs={[
						{ label: "Consumers", href: "/consumers" },
						{ label: consumerName },
					]}
				/>
				<div className="flex flex-1 flex-col gap-4 p-4">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-destructive">
								<AlertCircle className="h-5 w-5" />
								Error Loading Consumer
							</CardTitle>
							<CardDescription>
								{error instanceof Error ? error.message : "Failed to load consumer"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild variant="outline">
								<Link to="/consumers">
									<ArrowLeft className="h-4 w-4 mr-2" />
									Back to Consumers
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
				title={consumerName}
				breadcrumbs={[
					{ label: "Consumers", href: "/consumers" },
					{ label: cluster?.name || clusterId, href: "/consumers" },
					{ label: stream, href: `/streams/${clusterId}/${stream}` },
					{ label: consumerName },
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

			<div className="flex flex-1 flex-col gap-4 p-4">
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
				) : consumer ? (
					<>
						{/* Stats Cards */}
						<div className="grid gap-4 md:grid-cols-4">
							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Pending</CardTitle>
									<Layers className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatNumber(consumer.numPending)}
									</div>
									<p className="text-xs text-muted-foreground">
										Messages waiting to be delivered
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Ack Pending</CardTitle>
									<Clock className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className={`text-2xl font-bold ${consumer.numAckPending > 0 ? "text-yellow-500" : ""}`}>
										{formatNumber(consumer.numAckPending)}
									</div>
									<p className="text-xs text-muted-foreground">
										Awaiting acknowledgement
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Redelivered</CardTitle>
									<RefreshCw className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className={`text-2xl font-bold ${consumer.numRedelivered > 0 ? "text-orange-500" : ""}`}>
										{formatNumber(consumer.numRedelivered)}
									</div>
									<p className="text-xs text-muted-foreground">
										Messages redelivered
									</p>
								</CardContent>
							</Card>

							<Card>
								<CardHeader className="flex flex-row items-center justify-between pb-2">
									<CardTitle className="text-sm font-medium">Waiting</CardTitle>
									<Users className="h-4 w-4 text-muted-foreground" />
								</CardHeader>
								<CardContent>
									<div className="text-2xl font-bold">
										{formatNumber(consumer.numWaiting)}
									</div>
									<p className="text-xs text-muted-foreground">
										Pull requests waiting
									</p>
								</CardContent>
							</Card>
						</div>

						{/* Delivery Progress */}
						<Card>
							<CardHeader>
								<CardTitle>Delivery Progress</CardTitle>
								<CardDescription>
									Current position in the stream
								</CardDescription>
							</CardHeader>
							<CardContent>
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-2">
										<div className="text-sm font-medium">Delivered</div>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<div className="text-xs text-muted-foreground">Stream Seq</div>
												<div className="text-lg font-mono">{formatNumber(consumer.delivered.streamSeq)}</div>
											</div>
											<div>
												<div className="text-xs text-muted-foreground">Consumer Seq</div>
												<div className="text-lg font-mono">{formatNumber(consumer.delivered.consumerSeq)}</div>
											</div>
										</div>
									</div>
									<div className="space-y-2">
										<div className="text-sm font-medium">Ack Floor</div>
										<div className="grid grid-cols-2 gap-4">
											<div>
												<div className="text-xs text-muted-foreground">Stream Seq</div>
												<div className="text-lg font-mono">{formatNumber(consumer.ackFloor.streamSeq)}</div>
											</div>
											<div>
												<div className="text-xs text-muted-foreground">Consumer Seq</div>
												<div className="text-lg font-mono">{formatNumber(consumer.ackFloor.consumerSeq)}</div>
											</div>
										</div>
									</div>
								</div>
							</CardContent>
						</Card>

						{/* Tabs */}
						<Tabs defaultValue="config" className="space-y-4">
							<TabsList>
								<TabsTrigger value="config">Configuration</TabsTrigger>
								<TabsTrigger value="danger">Danger Zone</TabsTrigger>
							</TabsList>

							<TabsContent value="config" className="space-y-4">
								<Card>
									<CardHeader>
										<CardTitle>Consumer Configuration</CardTitle>
										<CardDescription>
											Current configuration for this consumer
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="grid gap-6 md:grid-cols-2">
											<div className="space-y-4">
												<div>
													<div className="text-sm font-medium">Stream</div>
													<div className="text-sm">
														<Link
															to="/streams/$clusterId/$name"
															params={{ clusterId, name: stream }}
															className="text-primary hover:underline"
														>
															{consumer.stream}
														</Link>
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Description</div>
													<div className="text-sm text-muted-foreground">
														{consumer.config.description || "No description"}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Filter Subject</div>
													<div className="text-sm">
														{consumer.config.filterSubject ? (
															<Badge variant="secondary" className="font-mono">
																{consumer.config.filterSubject}
															</Badge>
														) : consumer.config.filterSubjects?.length ? (
															<div className="flex flex-wrap gap-1">
																{consumer.config.filterSubjects.map((s) => (
																	<Badge key={s} variant="secondary" className="font-mono text-xs">
																		{s}
																	</Badge>
																))}
															</div>
														) : (
															<span className="text-muted-foreground">All subjects</span>
														)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Created</div>
													<div className="text-sm text-muted-foreground">
														{formatDate(consumer.created)}
													</div>
												</div>
											</div>

											<div className="space-y-4">
												<div>
													<div className="text-sm font-medium">Deliver Policy</div>
													<div className="text-sm">
														<Badge variant="outline" className="capitalize">
															{consumer.config.deliverPolicy?.replace(/_/g, " ") || "all"}
														</Badge>
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Ack Policy</div>
													<div className="text-sm">
														<Badge
															variant={consumer.config.ackPolicy === "explicit" ? "default" : "secondary"}
															className="capitalize"
														>
															{consumer.config.ackPolicy}
														</Badge>
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Replay Policy</div>
													<div className="text-sm">
														<Badge variant="outline" className="capitalize">
															{consumer.config.replayPolicy}
														</Badge>
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Ack Wait</div>
													<div className="text-sm text-muted-foreground">
														{formatDuration(consumer.config.ackWait)}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Max Deliver</div>
													<div className="text-sm text-muted-foreground">
														{consumer.config.maxDeliver === -1 ? "Unlimited" : consumer.config.maxDeliver}
													</div>
												</div>

												<div>
													<div className="text-sm font-medium">Max Ack Pending</div>
													<div className="text-sm text-muted-foreground">
														{consumer.config.maxAckPending || "Default"}
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
									<CardContent>
										<div className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg">
											<div>
												<div className="font-medium text-destructive">Delete Consumer</div>
												<div className="text-sm text-muted-foreground">
													Permanently delete this consumer. Any pending messages will be lost.
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
