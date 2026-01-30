import { useQuery } from "@tanstack/react-query";
import { Activity, RefreshCw, Server, Target, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { monitoringApi } from "@/lib/api";

interface SubscriptionsTabProps {
	clusterId: string;
	selectedServers: string[];
}

function formatNumber(num: number): string {
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

function formatPercent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}

export function SubscriptionsTab({ clusterId, selectedServers }: SubscriptionsTabProps) {
	// Create a stable key for the query based on selected servers
	const serversKey = selectedServers.slice().sort().join(",");

	const { data: subsz, isLoading, error, refetch, isFetching } = useQuery({
		queryKey: ["monitoring", "subsz", clusterId, serversKey],
		queryFn: () => monitoringApi.getSubsz(clusterId, selectedServers),
		refetchInterval: 5000,
		enabled: selectedServers.length > 0,
	});

	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 4 }).map((_, i) => (
					<Card key={i}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-4" />
						</CardHeader>
						<CardContent>
							<Skeleton className="h-8 w-20" />
							<Skeleton className="h-3 w-32 mt-1" />
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<Activity className="h-5 w-5" />
						Failed to load subscriptions
					</CardTitle>
					<CardDescription>
						{error instanceof Error ? error.message : "Unknown error"}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button onClick={() => refetch()}>
						<RefreshCw className="h-4 w-4 mr-2" />
						Retry
					</Button>
				</CardContent>
			</Card>
		);
	}

	if (!subsz?.totals) return null;

	const multipleServers = subsz.servers && subsz.servers.length > 1;
	const healthyServers = subsz.servers.filter(s => !s.error);
	const failedServers = subsz.servers.filter(s => s.error);

	// Calculate weighted average cache hit rate
	const avgCacheHitRate = healthyServers.length > 0
		? healthyServers.reduce((acc, s) => acc + s.cache_hit_rate, 0) / healthyServers.length
		: 0;

	return (
		<div className="space-y-4">
			{/* Refresh button */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Server className="h-4 w-4" />
					{healthyServers.length} of {subsz.servers.length} servers responding
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={() => refetch()}
					disabled={isFetching}
				>
					<RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
					Refresh
				</Button>
			</div>

			{/* Failed servers warning */}
			{failedServers.length > 0 && (
				<Card className="border-amber-500/50 bg-amber-500/5">
					<CardContent className="pt-4">
						<div className="flex flex-wrap gap-2 items-center">
							<span className="text-sm text-amber-600 dark:text-amber-400">Servers not responding:</span>
							{failedServers.map((server) => (
								<Badge key={server.url} variant="outline" className="text-xs font-mono">
									{server.url}
								</Badge>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Stats Grid */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{/* Subscriptions */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(subsz.totals.num_subscriptions)}</div>
						<p className="text-xs text-muted-foreground">
							{multipleServers ? "Across all servers" : "Active subscriptions"}
						</p>
					</CardContent>
				</Card>

				{/* Cache Size */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Cache Size</CardTitle>
						<Zap className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(subsz.totals.num_cache)}</div>
						<p className="text-xs text-muted-foreground">Cached subscriptions</p>
					</CardContent>
				</Card>

				{/* Max Fanout */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Max Fanout</CardTitle>
						<Target className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(subsz.totals.max_fanout)}</div>
						<p className="text-xs text-muted-foreground">Maximum message fanout</p>
					</CardContent>
				</Card>

				{/* Avg Fanout */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Avg Fanout</CardTitle>
						<Target className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{subsz.totals.avg_fanout.toFixed(2)}</div>
						<p className="text-xs text-muted-foreground">Average message fanout</p>
					</CardContent>
				</Card>
			</div>

			{/* Cache Hit Rate */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Zap className="h-5 w-5" />
						Cache Performance
					</CardTitle>
					<CardDescription>
						Subscription routing cache efficiency {multipleServers && "(average across servers)"}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<span className="text-sm font-medium">Cache Hit Rate</span>
							<span className="text-sm text-muted-foreground">
								{formatPercent(avgCacheHitRate)}
							</span>
						</div>
						<Progress value={avgCacheHitRate * 100} className="h-2" />
					</div>

					<div className="grid gap-4 md:grid-cols-3">
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Cache Matches</p>
							<p className="text-xl font-medium">{formatNumber(subsz.totals.num_matches)}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Cache Inserts</p>
							<p className="text-xl font-medium">{formatNumber(subsz.totals.num_inserts)}</p>
						</div>
						<div className="space-y-1">
							<p className="text-sm text-muted-foreground">Cache Removes</p>
							<p className="text-xl font-medium">{formatNumber(subsz.totals.num_removes)}</p>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Per-server stats */}
			{multipleServers && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Server className="h-5 w-5" />
							Per-Server Subscription Stats
						</CardTitle>
						<CardDescription>Subscription counts and cache hit rates per server</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{healthyServers.map((server) => (
								<div key={server.url} className="rounded-lg border p-3 space-y-2">
									<p className="text-xs text-muted-foreground font-mono truncate">{server.url}</p>
									<div className="grid grid-cols-2 gap-2 text-sm">
										<div>
											<span className="text-muted-foreground">Subs:</span>{" "}
											<span className="font-medium">{formatNumber(server.num_subscriptions)}</span>
										</div>
										<div>
											<span className="text-muted-foreground">Cache:</span>{" "}
											<span className="font-medium">{formatNumber(server.num_cache)}</span>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-xs text-muted-foreground">Hit rate:</span>
										<Progress value={server.cache_hit_rate * 100} className="h-1.5 flex-1" />
										<span className="text-xs">{formatPercent(server.cache_hit_rate)}</span>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Info Card */}
			<Card>
				<CardHeader>
					<CardTitle>About Subscription Statistics</CardTitle>
				</CardHeader>
				<CardContent className="text-sm text-muted-foreground space-y-2">
					<p>
						<strong>Subscriptions</strong> - Total number of active subscriptions across all connections.
					</p>
					<p>
						<strong>Cache Hit Rate</strong> - Percentage of message routing decisions served from cache.
						A higher rate indicates more efficient message routing.
					</p>
					<p>
						<strong>Fanout</strong> - Number of subscribers that receive each message.
						High fanout can indicate pub/sub patterns with many subscribers per subject.
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
