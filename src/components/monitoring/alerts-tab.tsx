import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertTriangle,
	Bell,
	BellOff,
	Check,
	MoreVertical,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CreateAlertDialog } from "./create-alert-dialog";
import {
	monitoringApi,
	type Alert,
	type AlertEvent,
	type AlertMetric,
	type AlertCondition,
} from "@/lib/api";

interface AlertsTabProps {
	clusterId: string;
}

const metricLabels: Record<AlertMetric, string> = {
	connections: "Connections",
	subscriptions: "Subscriptions",
	slow_consumers: "Slow Consumers",
	in_msgs_rate: "Messages In Rate",
	out_msgs_rate: "Messages Out Rate",
};

const conditionLabels: Record<AlertCondition, string> = {
	gt: ">",
	lt: "<",
	gte: ">=",
	lte: "<=",
};

function formatDate(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

export function AlertsTab({ clusterId }: AlertsTabProps) {
	const queryClient = useQueryClient();
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	const { data: alerts, isLoading: loadingAlerts, refetch } = useQuery({
		queryKey: ["monitoring", "alerts", clusterId],
		queryFn: () => monitoringApi.getAlerts(clusterId),
	});

	const { data: recentEvents, isLoading: loadingEvents } = useQuery({
		queryKey: ["monitoring", "events", "recent"],
		queryFn: () => monitoringApi.getRecentEvents(50),
		refetchInterval: 10000,
	});

	const handleToggleAlert = async (alert: Alert) => {
		try {
			await monitoringApi.updateAlert(alert.id, { enabled: !alert.enabled });
			queryClient.invalidateQueries({ queryKey: ["monitoring", "alerts"] });
		} catch (error) {
			alert("Failed to update alert");
		}
	};

	const handleDeleteAlert = async (alertId: string) => {
		if (!confirm("Are you sure you want to delete this alert?")) return;

		try {
			await monitoringApi.deleteAlert(alertId);
			queryClient.invalidateQueries({ queryKey: ["monitoring", "alerts"] });
		} catch (error) {
			alert("Failed to delete alert");
		}
	};

	const handleCheckAlerts = async () => {
		try {
			const result = await monitoringApi.checkAlerts(clusterId);
			queryClient.invalidateQueries({ queryKey: ["monitoring", "events"] });
			if (result.triggered > 0) {
				alert(`${result.triggered} alert(s) triggered!`);
			}
		} catch (error) {
			alert("Failed to check alerts");
		}
	};

	// Filter events to only those from this cluster's alerts
	const clusterAlertIds = new Set(alerts?.map((a) => a.id) ?? []);
	const clusterEvents = recentEvents?.filter((e) => clusterAlertIds.has(e.alert_id)) ?? [];

	if (loadingAlerts) {
		return (
			<Card>
				<CardHeader>
					<Skeleton className="h-6 w-32" />
					<Skeleton className="h-4 w-48" />
				</CardHeader>
				<CardContent className="space-y-2">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{/* Alerts List */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Alert Rules</CardTitle>
						<CardDescription>
							Configure alerts to monitor server metrics
						</CardDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button variant="outline" size="sm" onClick={handleCheckAlerts}>
							<RefreshCw className="h-4 w-4 mr-2" />
							Check Now
						</Button>
						<Button onClick={() => setShowCreateDialog(true)}>
							<Plus className="h-4 w-4 mr-2" />
							Create Alert
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{alerts && alerts.length > 0 ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Condition</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="w-[100px]">Enabled</TableHead>
									<TableHead className="w-[50px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{alerts.map((alert) => (
									<TableRow key={alert.id}>
										<TableCell className="font-medium">{alert.name}</TableCell>
										<TableCell>
											<code className="text-sm bg-muted px-2 py-1 rounded">
												{metricLabels[alert.metric]} {conditionLabels[alert.condition]} {alert.threshold}
											</code>
										</TableCell>
										<TableCell>
											<Badge variant={alert.enabled ? "default" : "secondary"}>
												{alert.enabled ? (
													<>
														<Bell className="h-3 w-3 mr-1" />
														Active
													</>
												) : (
													<>
														<BellOff className="h-3 w-3 mr-1" />
														Disabled
													</>
												)}
											</Badge>
										</TableCell>
										<TableCell>
											<Switch
												checked={alert.enabled}
												onCheckedChange={() => handleToggleAlert(alert)}
											/>
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" size="icon" className="h-8 w-8">
														<MoreVertical className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => handleToggleAlert(alert)}
													>
														{alert.enabled ? (
															<>
																<BellOff className="mr-2 h-4 w-4" />
																Disable
															</>
														) : (
															<>
																<Bell className="mr-2 h-4 w-4" />
																Enable
															</>
														)}
													</DropdownMenuItem>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														onClick={() => handleDeleteAlert(alert.id)}
														className="text-destructive focus:text-destructive"
													>
														<Trash2 className="mr-2 h-4 w-4" />
														Delete
													</DropdownMenuItem>
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					) : (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<Bell className="h-8 w-8 mb-2" />
							<p>No alerts configured</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={() => setShowCreateDialog(true)}
							>
								<Plus className="h-4 w-4 mr-2" />
								Create Your First Alert
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Recent Events */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5" />
						Recent Alert Events
					</CardTitle>
					<CardDescription>
						Alert triggers from the last 24 hours
					</CardDescription>
				</CardHeader>
				<CardContent>
					{loadingEvents ? (
						<div className="space-y-2">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-10 w-full" />
						</div>
					) : clusterEvents.length > 0 ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Time</TableHead>
									<TableHead>Alert</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Value</TableHead>
									<TableHead>Message</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{clusterEvents.map((event) => {
									const alert = alerts?.find((a) => a.id === event.alert_id);
									return (
										<TableRow key={event.id}>
											<TableCell className="text-xs text-muted-foreground">
												{formatDate(event.created_at)}
											</TableCell>
											<TableCell className="font-medium">
												{alert?.name ?? "Unknown Alert"}
											</TableCell>
											<TableCell>
												<Badge
													variant={event.status === "triggered" ? "destructive" : "default"}
												>
													{event.status === "triggered" ? (
														<AlertTriangle className="h-3 w-3 mr-1" />
													) : (
														<Check className="h-3 w-3 mr-1" />
													)}
													{event.status}
												</Badge>
											</TableCell>
											<TableCell className="font-mono">
												{event.value}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{event.message}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					) : (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<Check className="h-8 w-8 mb-2" />
							<p>No recent alert events</p>
						</div>
					)}
				</CardContent>
			</Card>

			<CreateAlertDialog
				clusterId={clusterId}
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
			/>
		</div>
	);
}
