import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Cable, RefreshCw, Search, Server } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { monitoringApi } from "@/lib/api";

interface ConnectionsTabProps {
	clusterId: string;
	selectedServers: string[];
}

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

export function ConnectionsTab({ clusterId, selectedServers }: ConnectionsTabProps) {
	const [searchQuery, setSearchQuery] = useState("");

	// Create a stable key for the query based on selected servers
	const serversKey = selectedServers.slice().sort().join(",");

	const { data: connz, isLoading, error, refetch, isFetching } = useQuery({
		queryKey: ["monitoring", "connz", clusterId, serversKey],
		queryFn: () => monitoringApi.getConnz(clusterId, selectedServers),
		refetchInterval: 5000,
		enabled: selectedServers.length > 0,
	});

	const filteredConnections = connz?.connections?.filter((conn) => {
		const query = searchQuery.toLowerCase();
		return (
			conn.ip.toLowerCase().includes(query) ||
			conn.name?.toLowerCase().includes(query) ||
			conn.lang?.toLowerCase().includes(query) ||
			conn.account?.toLowerCase().includes(query) ||
			conn.server_url?.toLowerCase().includes(query) ||
			String(conn.cid).includes(query)
		);
	});

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-4 w-48" />
				</CardHeader>
				<CardContent className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-destructive">
						<Cable className="h-5 w-5" />
						Failed to load connections
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

	if (!connz) return null;

	const multipleServers = connz.servers && connz.servers.length > 1;

	return (
		<div className="space-y-4">
			{/* Stats */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Active Connections</CardTitle>
						<Cable className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{connz.total_connections}</div>
						{multipleServers && (
							<p className="text-xs text-muted-foreground">
								Across {connz.servers.filter(s => !s.error).length} servers
							</p>
						)}
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Servers Responding</CardTitle>
						<Server className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{connz.servers.filter(s => !s.error).length}
							<span className="text-sm font-normal text-muted-foreground">
								{" "}of {connz.servers.length}
							</span>
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Showing</CardTitle>
						<Cable className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{filteredConnections?.length ?? 0}
							<span className="text-sm font-normal text-muted-foreground">
								{" "}of {connz.connections?.length ?? 0}
							</span>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Connections table */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Connections</CardTitle>
						<CardDescription>Active client connections to the server</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						<div className="relative">
							<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								placeholder="Search connections..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="pl-8 w-[200px]"
							/>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => refetch()}
							disabled={isFetching}
						>
							<RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{filteredConnections && filteredConnections.length > 0 ? (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>CID</TableHead>
										<TableHead>Name / Client</TableHead>
										<TableHead>IP</TableHead>
										{multipleServers && <TableHead>Server</TableHead>}
										<TableHead className="text-right">Subs</TableHead>
										<TableHead className="text-right">
											<span className="flex items-center justify-end gap-1">
												<ArrowDown className="h-3 w-3 text-green-500" />
												Msgs
											</span>
										</TableHead>
										<TableHead className="text-right">
											<span className="flex items-center justify-end gap-1">
												<ArrowUp className="h-3 w-3 text-blue-500" />
												Msgs
											</span>
										</TableHead>
										<TableHead className="text-right">
											<span className="flex items-center justify-end gap-1">
												<ArrowDown className="h-3 w-3 text-green-500" />
												Bytes
											</span>
										</TableHead>
										<TableHead className="text-right">
											<span className="flex items-center justify-end gap-1">
												<ArrowUp className="h-3 w-3 text-blue-500" />
												Bytes
											</span>
										</TableHead>
										<TableHead>RTT</TableHead>
										<TableHead>Uptime</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{filteredConnections.map((conn, index) => (
										<TableRow key={`${conn.server_url}-${conn.cid}-${index}`}>
											<TableCell className="font-mono text-xs">
												{conn.cid}
											</TableCell>
											<TableCell>
												<div className="flex flex-col gap-1">
													<span className="font-medium">
														{conn.name || "(unnamed)"}
													</span>
													{conn.lang && (
														<Badge variant="outline" className="w-fit text-xs">
															{conn.lang}
															{conn.version && ` ${conn.version}`}
														</Badge>
													)}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs">
												{conn.ip}:{conn.port}
											</TableCell>
											{multipleServers && (
												<TableCell className="font-mono text-xs max-w-[150px] truncate" title={conn.server_url}>
													{conn.server_url.replace(/^https?:\/\//, "")}
												</TableCell>
											)}
											<TableCell className="text-right font-mono">
												{conn.subscriptions}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatNumber(conn.in_msgs)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatNumber(conn.out_msgs)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatBytes(conn.in_bytes)}
											</TableCell>
											<TableCell className="text-right font-mono">
												{formatBytes(conn.out_bytes)}
											</TableCell>
											<TableCell className="font-mono text-xs">
												{conn.rtt}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{conn.uptime}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					) : (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<Cable className="h-8 w-8 mb-2" />
							{searchQuery ? (
								<p>No connections match your search</p>
							) : (
								<p>No active connections</p>
							)}
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
