import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Bell,
	BellOff,
	CheckCircle,
	Loader2,
	MessageSquare,
	MoreVertical,
	Pause,
	Play,
	Plus,
	Send,
	Trash2,
	Webhook,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
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
import {
	notificationsApi,
	type NotificationChannel,
	type NotificationChannelType,
} from "@/lib/api";

const channelTypeIcons: Record<NotificationChannelType, typeof Bell> = {
	telegram: Send,
	discord: MessageSquare,
	slack: MessageSquare,
	webhook: Webhook,
};

const channelTypeLabels: Record<NotificationChannelType, string> = {
	telegram: "Telegram",
	discord: "Discord",
	slack: "Slack",
	webhook: "Webhook",
};

export function NotificationsTab() {
	const queryClient = useQueryClient();
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	// Fetch channels
	const { data: channels, isLoading: loadingChannels } = useQuery({
		queryKey: ["notifications", "channels"],
		queryFn: notificationsApi.getChannels,
	});

	// Fetch monitor status
	const { data: monitorStatus, isLoading: loadingStatus } = useQuery({
		queryKey: ["notifications", "monitor", "status"],
		queryFn: notificationsApi.getMonitorStatus,
		refetchInterval: 5000,
	});

	// Toggle monitor
	const toggleMonitorMutation = useMutation({
		mutationFn: () =>
			monitorStatus?.running
				? notificationsApi.stopMonitor()
				: notificationsApi.startMonitor(),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications", "monitor"] });
			toast.success(monitorStatus?.running ? "Monitor stopped" : "Monitor started");
		},
		onError: () => toast.error("Failed to toggle monitor"),
	});

	// Update interval
	const updateIntervalMutation = useMutation({
		mutationFn: notificationsApi.setMonitorInterval,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications", "monitor"] });
			toast.success("Check interval updated");
		},
		onError: () => toast.error("Failed to update interval"),
	});

	// Toggle channel
	const toggleChannelMutation = useMutation({
		mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
			notificationsApi.updateChannel(id, { enabled }),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications", "channels"] });
		},
		onError: () => toast.error("Failed to update channel"),
	});

	// Test channel
	const testChannelMutation = useMutation({
		mutationFn: notificationsApi.testChannel,
		onSuccess: (data) => {
			if (data.success) {
				toast.success("Test notification sent");
			} else {
				toast.error(data.error || "Failed to send test notification");
			}
		},
		onError: () => toast.error("Failed to send test notification"),
	});

	// Delete channel
	const deleteChannelMutation = useMutation({
		mutationFn: notificationsApi.deleteChannel,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications", "channels"] });
			toast.success("Channel deleted");
		},
		onError: () => toast.error("Failed to delete channel"),
	});

	const handleDeleteChannel = (id: string) => {
		if (!confirm("Are you sure you want to delete this channel?")) return;
		deleteChannelMutation.mutate(id);
	};

	const formatInterval = (ms: number) => {
		if (ms < 60000) return `${ms / 1000}s`;
		return `${ms / 60000}m`;
	};

	if (loadingChannels || loadingStatus) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-32 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{/* Monitor Status Card */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{monitorStatus?.running ? (
								<Badge variant="default" className="bg-green-500">
									<Play className="h-3 w-3 mr-1" />
									Running
								</Badge>
							) : (
								<Badge variant="secondary">
									<Pause className="h-3 w-3 mr-1" />
									Stopped
								</Badge>
							)}
							Alert Monitor
						</CardTitle>
						<CardDescription>
							Automatically checks alerts and sends notifications
						</CardDescription>
					</div>
					<Button
						variant={monitorStatus?.running ? "destructive" : "default"}
						onClick={() => toggleMonitorMutation.mutate()}
						disabled={toggleMonitorMutation.isPending}
					>
						{monitorStatus?.running ? (
							<>
								<Pause className="h-4 w-4 mr-2" />
								Stop Monitor
							</>
						) : (
							<>
								<Play className="h-4 w-4 mr-2" />
								Start Monitor
							</>
						)}
					</Button>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-4">
						<Label htmlFor="interval">Check Interval:</Label>
						<Select
							value={String(monitorStatus?.interval || 30000)}
							onValueChange={(value) =>
								updateIntervalMutation.mutate(Number(value))
							}
						>
							<SelectTrigger className="w-32">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="10000">10 seconds</SelectItem>
								<SelectItem value="30000">30 seconds</SelectItem>
								<SelectItem value="60000">1 minute</SelectItem>
								<SelectItem value="300000">5 minutes</SelectItem>
								<SelectItem value="600000">10 minutes</SelectItem>
							</SelectContent>
						</Select>
						<span className="text-sm text-muted-foreground">
							Currently: {formatInterval(monitorStatus?.interval || 30000)}
						</span>
					</div>
				</CardContent>
			</Card>

			{/* Notification Channels */}
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Notification Channels</CardTitle>
						<CardDescription>
							Configure where to send alert notifications
						</CardDescription>
					</div>
					<Button onClick={() => setShowCreateDialog(true)}>
						<Plus className="h-4 w-4 mr-2" />
						Add Channel
					</Button>
				</CardHeader>
				<CardContent>
					{channels && channels.length > 0 ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Name</TableHead>
									<TableHead>Type</TableHead>
									<TableHead>Status</TableHead>
									<TableHead className="w-[100px]">Enabled</TableHead>
									<TableHead className="w-[50px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{channels.map((channel) => {
									const Icon = channelTypeIcons[channel.type];
									return (
										<TableRow key={channel.id}>
											<TableCell className="font-medium">
												{channel.name}
											</TableCell>
											<TableCell>
												<Badge variant="outline">
													<Icon className="h-3 w-3 mr-1" />
													{channelTypeLabels[channel.type]}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge
													variant={channel.enabled ? "default" : "secondary"}
												>
													{channel.enabled ? (
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
													checked={channel.enabled}
													onCheckedChange={(enabled) =>
														toggleChannelMutation.mutate({
															id: channel.id,
															enabled,
														})
													}
												/>
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="icon"
															className="h-8 w-8"
														>
															<MoreVertical className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																testChannelMutation.mutate(channel.id)
															}
														>
															<Send className="mr-2 h-4 w-4" />
															Send Test
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															onClick={() =>
																handleDeleteChannel(channel.id)
															}
															className="text-destructive focus:text-destructive"
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Delete
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					) : (
						<div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
							<Bell className="h-8 w-8 mb-2" />
							<p>No notification channels configured</p>
							<p className="text-sm">Add a channel to receive alert notifications</p>
							<Button
								variant="outline"
								className="mt-4"
								onClick={() => setShowCreateDialog(true)}
							>
								<Plus className="h-4 w-4 mr-2" />
								Add Your First Channel
							</Button>
						</div>
					)}
				</CardContent>
			</Card>

			<CreateChannelDialog
				open={showCreateDialog}
				onOpenChange={setShowCreateDialog}
			/>
		</div>
	);
}

// Create Channel Dialog
function CreateChannelDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [type, setType] = useState<NotificationChannelType>("telegram");
	const [error, setError] = useState("");

	// Telegram config
	const [botToken, setBotToken] = useState("");
	const [chatId, setChatId] = useState("");

	// Discord/Slack config
	const [webhookUrl, setWebhookUrl] = useState("");

	// Webhook config
	const [url, setUrl] = useState("");
	const [method, setMethod] = useState<"GET" | "POST">("POST");

	const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

	const createMutation = useMutation({
		mutationFn: notificationsApi.createChannel,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["notifications", "channels"] });
			toast.success("Channel created");
			handleClose();
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to create channel");
		},
	});

	const testMutation = useMutation({
		mutationFn: notificationsApi.testCredentials,
		onSuccess: (data) => {
			if (data.success) {
				setTestStatus("success");
				toast.success("Test notification sent successfully!");
			} else {
				setTestStatus("error");
				toast.error(data.error || "Test failed");
			}
		},
		onError: (err) => {
			setTestStatus("error");
			toast.error(err instanceof Error ? err.message : "Test failed");
		},
	});

	const getConfig = () => {
		switch (type) {
			case "telegram":
				return { botToken, chatId };
			case "discord":
			case "slack":
				return { webhookUrl };
			case "webhook":
				return { url, method };
		}
	};

	const canTest = () => {
		switch (type) {
			case "telegram":
				return botToken && chatId;
			case "discord":
			case "slack":
				return webhookUrl;
			case "webhook":
				return url;
		}
	};

	const handleTest = () => {
		if (!canTest()) {
			toast.error("Please fill in all required fields first");
			return;
		}
		setTestStatus("testing");
		testMutation.mutate({ type, config: getConfig() });
	};

	const handleClose = () => {
		onOpenChange(false);
		setName("");
		setType("telegram");
		setBotToken("");
		setChatId("");
		setWebhookUrl("");
		setUrl("");
		setMethod("POST");
		setError("");
		setTestStatus("idle");
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		let config;
		switch (type) {
			case "telegram":
				if (!botToken || !chatId) {
					setError("Bot token and chat ID are required");
					return;
				}
				config = { botToken, chatId };
				break;
			case "discord":
			case "slack":
				if (!webhookUrl) {
					setError("Webhook URL is required");
					return;
				}
				config = { webhookUrl };
				break;
			case "webhook":
				if (!url) {
					setError("URL is required");
					return;
				}
				config = { url, method };
				break;
		}

		createMutation.mutate({
			name: name.trim(),
			type,
			config,
			enabled: true,
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Add Notification Channel</DialogTitle>
					<DialogDescription>
						Configure a channel to receive alert notifications
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								placeholder="e.g., Production Alerts"
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>

						<div className="space-y-2">
							<Label>Type</Label>
							<Select
								value={type}
								onValueChange={(v) => setType(v as NotificationChannelType)}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="telegram">Telegram</SelectItem>
									<SelectItem value="discord">Discord</SelectItem>
									<SelectItem value="slack">Slack</SelectItem>
									<SelectItem value="webhook">Webhook</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Telegram Config */}
						{type === "telegram" && (
							<>
								<div className="space-y-2">
									<Label htmlFor="botToken">Bot Token</Label>
									<Input
										id="botToken"
										type="password"
										placeholder="123456:ABC-DEF..."
										value={botToken}
										onChange={(e) => setBotToken(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										Get this from @BotFather on Telegram
									</p>
								</div>
								<div className="space-y-2">
									<Label htmlFor="chatId">Chat ID</Label>
									<Input
										id="chatId"
										placeholder="-1001234567890"
										value={chatId}
										onChange={(e) => setChatId(e.target.value)}
									/>
									<p className="text-xs text-muted-foreground">
										Use @userinfobot to get your chat ID
									</p>
								</div>
							</>
						)}

						{/* Discord/Slack Config */}
						{(type === "discord" || type === "slack") && (
							<div className="space-y-2">
								<Label htmlFor="webhookUrl">Webhook URL</Label>
								<Input
									id="webhookUrl"
									type="url"
									placeholder={
										type === "discord"
											? "https://discord.com/api/webhooks/..."
											: "https://hooks.slack.com/services/..."
									}
									value={webhookUrl}
									onChange={(e) => setWebhookUrl(e.target.value)}
								/>
							</div>
						)}

						{/* Webhook Config */}
						{type === "webhook" && (
							<>
								<div className="space-y-2">
									<Label htmlFor="url">URL</Label>
									<Input
										id="url"
										type="url"
										placeholder="https://example.com/webhook"
										value={url}
										onChange={(e) => setUrl(e.target.value)}
									/>
								</div>
								<div className="space-y-2">
									<Label>Method</Label>
									<Select
										value={method}
										onValueChange={(v) => setMethod(v as "GET" | "POST")}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="POST">POST</SelectItem>
											<SelectItem value="GET">GET</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</>
						)}
					</div>
					<DialogFooter className="flex-col sm:flex-row gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={handleTest}
							disabled={testMutation.isPending || !canTest()}
							className="w-full sm:w-auto"
						>
							{testStatus === "testing" ? (
								<>
									<Loader2 className="h-4 w-4 mr-2 animate-spin" />
									Testing...
								</>
							) : testStatus === "success" ? (
								<>
									<CheckCircle className="h-4 w-4 mr-2 text-green-500" />
									Test Passed
								</>
							) : testStatus === "error" ? (
								<>
									<XCircle className="h-4 w-4 mr-2 text-red-500" />
									Test Failed
								</>
							) : (
								<>
									<Send className="h-4 w-4 mr-2" />
									Test
								</>
							)}
						</Button>
						<div className="flex gap-2 w-full sm:w-auto">
							<Button
								type="button"
								variant="outline"
								onClick={handleClose}
								disabled={createMutation.isPending}
							>
								Cancel
							</Button>
							<Button type="submit" disabled={createMutation.isPending}>
								{createMutation.isPending ? "Creating..." : "Create Channel"}
							</Button>
						</div>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
