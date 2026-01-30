import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
	Command,
	Database,
	HardDrive,
	Layers,
	Plus,
	RefreshCw,
	Server,
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
import { StatCard } from "@/components/ui/stat-card";
import { statsApi, type ClusterStats } from "@/lib/api";

export const Route = createFileRoute("/_app/dashboard")({
	component: DashboardPage,
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

function StatCardSkeleton() {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-10 w-10 rounded-xl" />
			</CardHeader>
			<CardContent>
				<Skeleton className="h-9 w-16 mb-2" />
				<Skeleton className="h-3 w-28" />
			</CardContent>
		</Card>
	);
}

function ClusterStatusCard({ cluster }: { cluster: ClusterStats }) {
	return (
		<Card>
			<CardHeader className="pb-2">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						{cluster.connected ? (
							<CheckCircle2 className="h-4 w-4 text-green-500" />
						) : (
							<AlertCircle className="h-4 w-4 text-destructive" />
						)}
						<CardTitle className="text-base">{cluster.name}</CardTitle>
					</div>
					<Badge variant={cluster.connected ? "default" : "destructive"}>
						{cluster.connected ? "Connected" : "Disconnected"}
					</Badge>
				</div>
			</CardHeader>
			<CardContent>
				{cluster.connected && cluster.serverInfo ? (
					<div className="space-y-2 text-sm">
						<div className="flex justify-between">
							<span className="text-muted-foreground">Server</span>
							<span>{cluster.serverInfo.serverName}</span>
						</div>
						<div className="flex justify-between">
							<span className="text-muted-foreground">Version</span>
							<span>v{cluster.serverInfo.version}</span>
						</div>
						{cluster.jetstream && (
							<>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Streams</span>
									<span>{cluster.jetstream.streams}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Messages</span>
									<span>{formatNumber(cluster.jetstream.messages)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted-foreground">Storage</span>
									<span>{formatBytes(cluster.jetstream.bytes)}</span>
								</div>
							</>
						)}
						{!cluster.serverInfo.jetstream && (
							<p className="text-xs text-muted-foreground italic">
								JetStream not enabled
							</p>
						)}
					</div>
				) : (
					<p className="text-sm text-destructive">{cluster.error || "Connection failed"}</p>
				)}
			</CardContent>
		</Card>
	);
}

function DashboardPage() {
	const {
		data: stats,
		isLoading,
		refetch,
		isFetching,
	} = useQuery({
		queryKey: ["dashboard-stats"],
		queryFn: () => statsApi.getDashboard(),
		refetchInterval: 30000, // Refresh every 30 seconds
	});

	const hasClusters = stats && stats.clusters.total > 0;

	return (
		<>
			<AppHeader title="Dashboard">
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
			<div className="page-content gap-6 p-6">
				{/* Stats Cards */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					{isLoading ? (
						<>
							<StatCardSkeleton />
							<StatCardSkeleton />
							<StatCardSkeleton />
							<StatCardSkeleton />
						</>
					) : (
						<>
							<StatCard
								title="Clusters"
								value={stats?.clusters.total ?? 0}
								subtitle={
									stats
										? `${stats.clusters.connected} connected, ${stats.clusters.disconnected} offline`
										: "No clusters"
								}
								icon={Server}
								iconColor="blue"
							/>
							<StatCard
								title="Streams"
								value={stats?.totals.streams ?? 0}
								subtitle="Across all clusters"
								icon={Layers}
								iconColor="purple"
							/>
							<StatCard
								title="Consumers"
								value={stats?.totals.consumers ?? 0}
								subtitle="Across all clusters"
								icon={Users}
								iconColor="green"
							/>
							<StatCard
								title="Messages"
								value={formatNumber(stats?.totals.messages ?? 0)}
								subtitle={`${formatBytes(stats?.totals.bytes ?? 0)} stored`}
								icon={Activity}
								iconColor="amber"
							/>
						</>
					)}
				</div>

				{/* Cluster Status & Quick Actions */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
					{/* Cluster Status */}
					<Card className="lg:col-span-2">
						<CardHeader>
							<div className="flex items-center justify-between">
								<div>
									<CardTitle>Cluster Status</CardTitle>
									<CardDescription>
										Real-time health of your NATS clusters
									</CardDescription>
								</div>
								{hasClusters && (
									<Button variant="outline" size="sm" asChild>
										<Link to="/clusters">View All</Link>
									</Button>
								)}
							</div>
						</CardHeader>
						<CardContent>
							{isLoading ? (
								<div className="grid gap-4 md:grid-cols-2">
									{[1, 2].map((i) => (
										<Card key={i}>
											<CardHeader className="pb-2">
												<Skeleton className="h-5 w-32" />
											</CardHeader>
											<CardContent className="space-y-2">
												<Skeleton className="h-4 w-full" />
												<Skeleton className="h-4 w-3/4" />
											</CardContent>
										</Card>
									))}
								</div>
							) : hasClusters ? (
								<div className="grid gap-4 md:grid-cols-2">
									{stats.clusterStats.map((cluster) => (
										<ClusterStatusCard key={cluster.id} cluster={cluster} />
									))}
								</div>
							) : (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<Server className="h-12 w-12 text-muted-foreground mb-4" />
									<p className="text-muted-foreground mb-4">
										No clusters configured yet
									</p>
									<Button asChild>
										<Link to="/clusters">
											<Plus className="h-4 w-4 mr-2" />
											Add Your First Cluster
										</Link>
									</Button>
								</div>
							)}
						</CardContent>
					</Card>

					{/* Quick Actions */}
					<Card>
						<CardHeader>
							<CardTitle>Quick Actions</CardTitle>
							<CardDescription>Common tasks and shortcuts</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2">
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/clusters">
									<Server className="h-4 w-4 mr-2" />
									Manage Clusters
									<kbd className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">g c</kbd>
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/streams">
									<Layers className="h-4 w-4 mr-2" />
									View Streams
									<kbd className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">g s</kbd>
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/consumers">
									<Users className="h-4 w-4 mr-2" />
									View Consumers
									<kbd className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">g o</kbd>
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/kv">
									<Database className="h-4 w-4 mr-2" />
									KV Store
									<kbd className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">g k</kbd>
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-between" asChild>
								<button type="button" onClick={() => {
									const event = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
									document.dispatchEvent(event);
								}}>
									<span className="flex items-center">
										<Command className="h-4 w-4 mr-2" />
										Command Palette
									</span>
									<kbd className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
								</button>
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
