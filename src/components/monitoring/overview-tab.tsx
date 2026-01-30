import { useQuery } from "@tanstack/react-query";
import {
	Activity,
	ArrowDown,
	ArrowUp,
	Cable,
	CheckCircle,
	Cpu,
	Database,
	Heart,
	MemoryStick,
	RefreshCw,
	Server,
	Users,
	XCircle,
	Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	LineChart,
	Line,
	XAxis,
	YAxis,
	CartesianGrid,
	Tooltip,
	ResponsiveContainer,
	Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { monitoringApi, type AggregatedVarz } from "@/lib/api";

interface OverviewTabProps {
	clusterId: string;
	selectedServers: string[];
}

interface ChartDataPoint {
	time: string;
	inMsgs: number;
	outMsgs: number;
	inBytes: number;
	outBytes: number;
}

interface PrevTotals {
	in_msgs: number;
	out_msgs: number;
	in_bytes: number;
	out_bytes: number;
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatNumber(num: number): string {
	if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
	if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
	if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
	return num.toString();
}

function formatUptime(uptime: string): string {
	// NATS uptime is in format like "1h2m3s"
	return uptime;
}

export function OverviewTab({ clusterId, selectedServers }: OverviewTabProps) {
	const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
	const prevTotalsRef = useRef<PrevTotals | null>(null);

	// Create a stable key for the query based on selected servers
	const serversKey = selectedServers.slice().sort().join(",");

	const { data: varz, isLoading, error, refetch, isFetching } = useQuery({
		queryKey: ["monitoring", "varz", clusterId, serversKey],
		queryFn: () => monitoringApi.getVarz(clusterId, selectedServers),
		refetchInterval: 5000,
		enabled: selectedServers.length > 0,
	});

	const { data: health } = useQuery({
		queryKey: ["monitoring", "health", clusterId, serversKey],
		queryFn: () => monitoringApi.getHealth(clusterId, selectedServers),
		refetchInterval: 5000,
		enabled: selectedServers.length > 0,
	});

	// Reset chart data when selected servers change
	useEffect(() => {
		setChartData([]);
		prevTotalsRef.current = null;
	}, [serversKey]);

	// Update chart data when varz changes
	useEffect(() => {
		if (!varz?.totals) return;

		const now = new Date();
		const timeStr = now.toLocaleTimeString("en-US", {
			hour12: false,
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
		});

		// Calculate rates if we have previous data
		let inMsgsRate = 0;
		let outMsgsRate = 0;
		let inBytesRate = 0;
		let outBytesRate = 0;

		if (prevTotalsRef.current) {
			inMsgsRate = Math.max(0, varz.totals.in_msgs - prevTotalsRef.current.in_msgs);
			outMsgsRate = Math.max(0, varz.totals.out_msgs - prevTotalsRef.current.out_msgs);
			inBytesRate = Math.max(0, varz.totals.in_bytes - prevTotalsRef.current.in_bytes);
			outBytesRate = Math.max(0, varz.totals.out_bytes - prevTotalsRef.current.out_bytes);
		}

		prevTotalsRef.current = {
			in_msgs: varz.totals.in_msgs,
			out_msgs: varz.totals.out_msgs,
			in_bytes: varz.totals.in_bytes,
			out_bytes: varz.totals.out_bytes,
		};

		setChartData((prev) => {
			const newData = [
				...prev,
				{
					time: timeStr,
					inMsgs: inMsgsRate,
					outMsgs: outMsgsRate,
					inBytes: inBytesRate,
					outBytes: outBytesRate,
				},
			];
			// Keep last 60 data points (5 minutes at 5s intervals)
			return newData.slice(-60);
		});
	}, [varz]);

	if (isLoading) {
		return (
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{Array.from({ length: 8 }).map((_, i) => (
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
						Failed to load monitoring data
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

	if (!varz?.totals) return null;

	const isHealthy = health?.overall_status === "ok";
	const isDegraded = health?.overall_status === "degraded";
	const healthyServers = varz.servers.filter(s => !s.error);
	const failedServers = varz.servers.filter(s => s.error);

	return (
		<div className="space-y-4">
			{/* Health Status */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<div
						className={`h-3 w-3 rounded-full ${
							isHealthy ? "bg-green-500" : isDegraded ? "bg-amber-500" : "bg-red-500"
						} animate-pulse`}
					/>
					<span className="font-medium">
						{isHealthy ? "Healthy" : isDegraded ? "Degraded" : "Unhealthy"}
					</span>
					{health && (
						<span className="text-muted-foreground">
							- {health.healthy_count}/{health.total_count} servers responding
						</span>
					)}
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
					<CardHeader className="pb-2">
						<CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
							<XCircle className="h-4 w-4" />
							{failedServers.length} server{failedServers.length > 1 ? "s" : ""} not responding
						</CardTitle>
					</CardHeader>
					<CardContent className="pt-0">
						<div className="flex flex-wrap gap-2">
							{failedServers.map((server) => (
								<Badge key={server.url} variant="outline" className="text-xs font-mono">
									{server.url}
								</Badge>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Stats Grid - Aggregated Totals */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{/* Connections */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Connections</CardTitle>
						<Cable className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(varz.totals.connections)}</div>
						<p className="text-xs text-muted-foreground">
							{formatNumber(varz.totals.total_connections)} total (lifetime)
						</p>
					</CardContent>
				</Card>

				{/* Subscriptions */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
						<Users className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(varz.totals.subscriptions)}</div>
						<p className="text-xs text-muted-foreground">Active subscriptions</p>
					</CardContent>
				</Card>

				{/* Slow Consumers */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Slow Consumers</CardTitle>
						<Zap className={`h-4 w-4 ${varz.totals.slow_consumers > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
					</CardHeader>
					<CardContent>
						<div className={`text-2xl font-bold ${varz.totals.slow_consumers > 0 ? "text-amber-500" : ""}`}>
							{varz.totals.slow_consumers}
						</div>
						<p className="text-xs text-muted-foreground">
							{varz.totals.slow_consumers > 0 ? "Consumers lagging behind" : "All consumers healthy"}
						</p>
					</CardContent>
				</Card>

				{/* Servers */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Servers</CardTitle>
						<Server className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{healthyServers.length}</div>
						<p className="text-xs text-muted-foreground">
							of {varz.servers.length} responding
						</p>
					</CardContent>
				</Card>

				{/* Messages In */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Messages In</CardTitle>
						<ArrowDown className="h-4 w-4 text-green-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(varz.totals.in_msgs)}</div>
						<p className="text-xs text-muted-foreground">{formatBytes(varz.totals.in_bytes)} total</p>
					</CardContent>
				</Card>

				{/* Messages Out */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Messages Out</CardTitle>
						<ArrowUp className="h-4 w-4 text-blue-500" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatNumber(varz.totals.out_msgs)}</div>
						<p className="text-xs text-muted-foreground">{formatBytes(varz.totals.out_bytes)} total</p>
					</CardContent>
				</Card>

				{/* Routes */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Routes</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{varz.totals.routes}</div>
						<p className="text-xs text-muted-foreground">Cluster routes</p>
					</CardContent>
				</Card>

				{/* Leafnodes */}
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Leafnodes</CardTitle>
						<Activity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{varz.totals.leafnodes}</div>
						<p className="text-xs text-muted-foreground">Leaf connections</p>
					</CardContent>
				</Card>
			</div>

			{/* Per-Server Stats */}
			{healthyServers.length > 1 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Server className="h-5 w-5" />
							Per-Server Resources
						</CardTitle>
						<CardDescription>CPU and memory usage per server</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
							{healthyServers.map((server) => (
								<div key={server.url} className="rounded-lg border p-3 space-y-2">
									<div className="flex items-center justify-between">
										<span className="font-medium text-sm">{server.server_name}</span>
										<Badge variant="outline" className="text-xs">v{server.version}</Badge>
									</div>
									<p className="text-xs text-muted-foreground font-mono truncate">{server.url}</p>
									<div className="grid grid-cols-2 gap-2 text-sm">
										<div className="flex items-center gap-1">
											<Cpu className="h-3 w-3 text-muted-foreground" />
											<span>{server.cpu.toFixed(1)}%</span>
										</div>
										<div className="flex items-center gap-1">
											<MemoryStick className="h-3 w-3 text-muted-foreground" />
											<span>{formatBytes(server.mem)}</span>
										</div>
									</div>
									<p className="text-xs text-muted-foreground">Uptime: {server.uptime}</p>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			)}

			{/* Single server stats */}
			{healthyServers.length === 1 && (
				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">CPU</CardTitle>
							<Cpu className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{healthyServers[0].cpu.toFixed(1)}%</div>
							<p className="text-xs text-muted-foreground">{healthyServers[0].server_name}</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">Memory</CardTitle>
							<MemoryStick className="h-4 w-4 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							<div className="text-2xl font-bold">{formatBytes(healthyServers[0].mem)}</div>
							<p className="text-xs text-muted-foreground">Uptime: {healthyServers[0].uptime}</p>
						</CardContent>
					</Card>
				</div>
			)}

			{/* JetStream Stats */}
			{varz.jetstream && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Database className="h-5 w-5" />
							JetStream
						</CardTitle>
						<CardDescription>JetStream storage and API statistics (aggregated)</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Memory Used</p>
								<p className="text-xl font-medium">
									{formatBytes(varz.jetstream.memory)}
								</p>
								<p className="text-xs text-muted-foreground">
									of {formatBytes(varz.jetstream.reserved_memory)} reserved
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Storage Used</p>
								<p className="text-xl font-medium">
									{formatBytes(varz.jetstream.storage)}
								</p>
								<p className="text-xs text-muted-foreground">
									of {formatBytes(varz.jetstream.reserved_storage)} reserved
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">API Requests</p>
								<p className="text-xl font-medium">
									{formatNumber(varz.jetstream.api_total)}
								</p>
								<p className="text-xs text-muted-foreground">
									{varz.jetstream.api_errors} errors
								</p>
							</div>
							<div className="space-y-1">
								<p className="text-sm text-muted-foreground">Accounts</p>
								<p className="text-xl font-medium">
									{varz.jetstream.accounts}
								</p>
								<p className="text-xs text-muted-foreground">With JetStream enabled</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Message Rate Chart */}
			<Card>
				<CardHeader>
					<CardTitle>Message Rate</CardTitle>
					<CardDescription>
						Messages per 5 second interval (in = green, out = blue)
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						{chartData.length > 1 ? (
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={chartData}>
									<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
									<XAxis
										dataKey="time"
										tick={{ fontSize: 12 }}
										className="text-muted-foreground"
									/>
									<YAxis
										tick={{ fontSize: 12 }}
										tickFormatter={(value) => formatNumber(value)}
										className="text-muted-foreground"
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: "hsl(var(--popover))",
											border: "1px solid hsl(var(--border))",
											borderRadius: "8px",
										}}
										labelStyle={{ color: "hsl(var(--foreground))" }}
										formatter={(value: number, name: string) => [
											formatNumber(value),
											name === "inMsgs" ? "In" : "Out",
										]}
									/>
									<Legend />
									<Line
										type="monotone"
										dataKey="inMsgs"
										name="Messages In"
										stroke="hsl(142, 76%, 36%)"
										strokeWidth={2}
										dot={false}
									/>
									<Line
										type="monotone"
										dataKey="outMsgs"
										name="Messages Out"
										stroke="hsl(217, 91%, 60%)"
										strokeWidth={2}
										dot={false}
									/>
								</LineChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-full items-center justify-center text-muted-foreground">
								Collecting data...
							</div>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Bytes Rate Chart */}
			<Card>
				<CardHeader>
					<CardTitle>Data Rate</CardTitle>
					<CardDescription>
						Bytes per 5 second interval (in = green, out = blue)
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="h-[300px]">
						{chartData.length > 1 ? (
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={chartData}>
									<CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
									<XAxis
										dataKey="time"
										tick={{ fontSize: 12 }}
										className="text-muted-foreground"
									/>
									<YAxis
										tick={{ fontSize: 12 }}
										tickFormatter={(value) => formatBytes(value)}
										className="text-muted-foreground"
									/>
									<Tooltip
										contentStyle={{
											backgroundColor: "hsl(var(--popover))",
											border: "1px solid hsl(var(--border))",
											borderRadius: "8px",
										}}
										labelStyle={{ color: "hsl(var(--foreground))" }}
										formatter={(value: number, name: string) => [
											formatBytes(value),
											name === "inBytes" ? "In" : "Out",
										]}
									/>
									<Legend />
									<Line
										type="monotone"
										dataKey="inBytes"
										name="Bytes In"
										stroke="hsl(142, 76%, 36%)"
										strokeWidth={2}
										dot={false}
									/>
									<Line
										type="monotone"
										dataKey="outBytes"
										name="Bytes Out"
										stroke="hsl(217, 91%, 60%)"
										strokeWidth={2}
										dot={false}
									/>
								</LineChart>
							</ResponsiveContainer>
						) : (
							<div className="flex h-full items-center justify-center text-muted-foreground">
								Collecting data...
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
