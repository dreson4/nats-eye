import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertCircle,
	AlertTriangle,
	Bell,
	BellRing,
	Cable,
	Check,
	Heart,
	Plus,
	Server,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { OverviewTab } from "@/components/monitoring/overview-tab";
import { ConnectionsTab } from "@/components/monitoring/connections-tab";
import { SubscriptionsTab } from "@/components/monitoring/subscriptions-tab";
import { AlertsTab } from "@/components/monitoring/alerts-tab";
import { NotificationsTab } from "@/components/monitoring/notifications-tab";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clustersApi } from "@/lib/api";

export const Route = createFileRoute("/_app/monitoring")({
	component: MonitoringPage,
});

function MonitoringPage() {
	const [selectedCluster, setSelectedCluster] = useState<string>("");
	const [activeTab, setActiveTab] = useState("overview");
	const [selectedServers, setSelectedServers] = useState<string[]>([]);

	const { data: clusters, isLoading: loadingClusters } = useQuery({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
	});

	// Filter to only clusters with monitoring enabled
	const monitoringClusters = clusters?.filter((c) => c.monitoringUrls && c.monitoringUrls.length > 0) ?? [];

	// Auto-select first monitoring-enabled cluster
	if (monitoringClusters.length > 0 && !selectedCluster) {
		setSelectedCluster(monitoringClusters[0].id);
	}

	const selectedClusterData = clusters?.find((c) => c.id === selectedCluster);
	const availableServers = selectedClusterData?.monitoringUrls ?? [];

	// Initialize selected servers when cluster changes
	useEffect(() => {
		if (selectedClusterData?.monitoringUrls && selectedClusterData.monitoringUrls.length > 0) {
			setSelectedServers(selectedClusterData.monitoringUrls);
		}
	}, [selectedCluster, selectedClusterData?.monitoringUrls]);

	const handleServerToggle = (url: string) => {
		setSelectedServers((prev) => {
			if (prev.includes(url)) {
				// Don't allow deselecting all servers
				if (prev.length === 1) return prev;
				return prev.filter((u) => u !== url);
			}
			return [...prev, url];
		});
	};

	const handleSelectAll = () => {
		setSelectedServers(availableServers);
	};

	return (
		<>
			<AppHeader title="Monitoring">
				{selectedCluster && (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Activity className="h-4 w-4" />
						Live monitoring
					</div>
				)}
			</AppHeader>
			<div className="page-content">
				{/* Cluster selector */}
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select
							value={selectedCluster}
							onValueChange={setSelectedCluster}
							disabled={loadingClusters || monitoringClusters.length === 0}
						>
							<SelectTrigger className="w-[250px]">
								<SelectValue placeholder="Select a cluster" />
							</SelectTrigger>
							<SelectContent>
								{monitoringClusters.map((cluster) => (
									<SelectItem key={cluster.id} value={cluster.id}>
										{cluster.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						{availableServers.length > 0 && (
							<Popover>
								<PopoverTrigger asChild>
									<Button variant="outline" size="sm" className="h-8">
										<Server className="h-4 w-4 mr-2" />
										{selectedServers.length === availableServers.length
											? `All servers (${availableServers.length})`
											: `${selectedServers.length} of ${availableServers.length} servers`}
									</Button>
								</PopoverTrigger>
								<PopoverContent className="w-80" align="start">
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<h4 className="text-sm font-medium">Select Servers</h4>
											<Button
												variant="ghost"
												size="sm"
												onClick={handleSelectAll}
												disabled={selectedServers.length === availableServers.length}
												className="h-7 text-xs"
											>
												<Check className="h-3 w-3 mr-1" />
												Select All
											</Button>
										</div>
										<p className="text-xs text-muted-foreground">
											Select which servers to include in the monitoring view. Stats will be aggregated from selected servers.
										</p>
										<div className="space-y-2">
											{availableServers.map((url) => (
												<div key={url} className="flex items-center space-x-2">
													<Checkbox
														id={url}
														checked={selectedServers.includes(url)}
														onCheckedChange={() => handleServerToggle(url)}
													/>
													<Label
														htmlFor={url}
														className="text-xs font-mono cursor-pointer"
													>
														{url}
													</Label>
												</div>
											))}
										</div>
									</div>
								</PopoverContent>
							</Popover>
						)}
					</div>
				</div>

				{/* Content */}
				{!loadingClusters && clusters?.length === 0 ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<AlertCircle className="h-5 w-5" />
								No Clusters Available
							</CardTitle>
							<CardDescription>
								You need to add a cluster before you can view monitoring data.
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
				) : !loadingClusters && monitoringClusters.length === 0 ? (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<AlertTriangle className="h-5 w-5 text-amber-500" />
								No Monitoring Configured
							</CardTitle>
							<CardDescription>
								None of your clusters have a monitoring URL configured. Edit a cluster to add the NATS monitoring endpoint (usually port 8222).
							</CardDescription>
						</CardHeader>
						<CardContent>
							<Button asChild variant="outline">
								<Link to="/clusters">
									<Server className="h-4 w-4 mr-2" />
									Configure Clusters
								</Link>
							</Button>
						</CardContent>
					</Card>
				) : selectedCluster ? (
					<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
						<div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
							<TabsList className="w-max min-w-full sm:w-auto">
								<TabsTrigger value="overview" className="flex items-center gap-2">
									<Heart className="h-4 w-4" />
									<span className="hidden sm:inline">Overview</span>
									<span className="sm:hidden">Overview</span>
								</TabsTrigger>
								<TabsTrigger value="connections" className="flex items-center gap-2">
									<Cable className="h-4 w-4" />
									<span className="hidden sm:inline">Connections</span>
									<span className="sm:hidden">Conn</span>
								</TabsTrigger>
								<TabsTrigger value="subscriptions" className="flex items-center gap-2">
									<Activity className="h-4 w-4" />
									<span className="hidden sm:inline">Subscriptions</span>
									<span className="sm:hidden">Subs</span>
								</TabsTrigger>
								<TabsTrigger value="alerts" className="flex items-center gap-2">
									<Bell className="h-4 w-4" />
									<span>Alerts</span>
								</TabsTrigger>
								<TabsTrigger value="notifications" className="flex items-center gap-2">
									<BellRing className="h-4 w-4" />
									<span className="hidden sm:inline">Notifications</span>
									<span className="sm:hidden">Notify</span>
								</TabsTrigger>
							</TabsList>
						</div>

						<TabsContent value="overview" className="space-y-4">
							<OverviewTab clusterId={selectedCluster} selectedServers={selectedServers} />
						</TabsContent>

						<TabsContent value="connections" className="space-y-4">
							<ConnectionsTab clusterId={selectedCluster} selectedServers={selectedServers} />
						</TabsContent>

						<TabsContent value="subscriptions" className="space-y-4">
							<SubscriptionsTab clusterId={selectedCluster} selectedServers={selectedServers} />
						</TabsContent>

						<TabsContent value="alerts" className="space-y-4">
							<AlertsTab clusterId={selectedCluster} />
						</TabsContent>

						<TabsContent value="notifications" className="space-y-4">
							<NotificationsTab />
						</TabsContent>
					</Tabs>
				) : null}
			</div>
		</>
	);
}
