import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertCircle,
	CheckCircle2,
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

function StatCard({
	title,
	value,
	description,
	icon: Icon,
	loading,
}: {
	title: string;
	value: string | number;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	loading?: boolean;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				<Icon className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{loading ? (
					<>
						<Skeleton className="h-8 w-16 mb-1" />
						<Skeleton className="h-3 w-24" />
					</>
				) : (
					<>
						<div className="text-2xl font-bold">{value}</div>
						<p className="text-xs text-muted-foreground">{description}</p>
					</>
				)}
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
			<div className="flex flex-1 flex-col gap-4 p-4">
				{/* Stats Cards */}
				<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
					<StatCard
						title="Clusters"
						value={stats?.clusters.total ?? 0}
						description={
							stats
								? `${stats.clusters.connected} connected, ${stats.clusters.disconnected} disconnected`
								: "No clusters"
						}
						icon={Server}
						loading={isLoading}
					/>
					<StatCard
						title="Streams"
						value={stats?.totals.streams ?? 0}
						description="Across all clusters"
						icon={Layers}
						loading={isLoading}
					/>
					<StatCard
						title="Consumers"
						value={stats?.totals.consumers ?? 0}
						description="Across all clusters"
						icon={Users}
						loading={isLoading}
					/>
					<StatCard
						title="Total Messages"
						value={formatNumber(stats?.totals.messages ?? 0)}
						description={`${formatBytes(stats?.totals.bytes ?? 0)} stored`}
						icon={Activity}
						loading={isLoading}
					/>
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
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/streams">
									<Layers className="h-4 w-4 mr-2" />
									View Streams
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/consumers">
									<Users className="h-4 w-4 mr-2" />
									View Consumers
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/kv">
									<Database className="h-4 w-4 mr-2" />
									KV Store
								</Link>
							</Button>
							<Button variant="outline" className="w-full justify-start" asChild>
								<Link to="/settings">
									<HardDrive className="h-4 w-4 mr-2" />
									Settings
								</Link>
							</Button>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
