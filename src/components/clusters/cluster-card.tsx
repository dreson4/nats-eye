import { useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2,
	Loader2,
	MoreVertical,
	Pencil,
	Server,
	Trash2,
	Wifi,
	WifiOff,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clustersApi, type ClusterData } from "@/lib/api";
import { EditClusterDialog } from "./edit-cluster-dialog";

interface ClusterCardProps {
	cluster: ClusterData;
}

export function ClusterCard({ cluster }: ClusterCardProps) {
	const queryClient = useQueryClient();
	const [status, setStatus] = useState<
		"idle" | "testing" | "connected" | "error"
	>("idle");
	const [serverInfo, setServerInfo] = useState<{
		serverName: string;
		version: string;
		jetstream: boolean;
	} | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [showEditDialog, setShowEditDialog] = useState(false);

	const handleTestConnection = async () => {
		setStatus("testing");
		setErrorMessage(null);
		try {
			const result = await clustersApi.testExisting(cluster.id);
			if (result.success && result.serverInfo) {
				setStatus("connected");
				setServerInfo(result.serverInfo);
			} else {
				setStatus("error");
				setErrorMessage(result.error || "Connection failed");
			}
		} catch {
			setStatus("error");
			setErrorMessage("Failed to test connection");
		}
	};

	const handleDelete = async () => {
		if (
			!confirm(
				`Are you sure you want to delete "${cluster.name}"? This action cannot be undone.`,
			)
		) {
			return;
		}

		setIsDeleting(true);
		try {
			await clustersApi.delete(cluster.id);
			await queryClient.invalidateQueries({ queryKey: ["clusters"] });
		} finally {
			setIsDeleting(false);
		}
	};

	const statusIcon = () => {
		switch (status) {
			case "testing":
				return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
			case "connected":
				return <CheckCircle2 className="h-4 w-4 text-green-500" />;
			case "error":
				return <XCircle className="h-4 w-4 text-destructive" />;
			default:
				return <Server className="h-4 w-4 text-muted-foreground" />;
		}
	};

	return (
		<>
			<Card className="relative">
				<CardHeader className="pb-2">
					<div className="flex items-start justify-between">
						<div className="flex items-center gap-2">
							{statusIcon()}
							<CardTitle className="text-lg">{cluster.name}</CardTitle>
						</div>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8"
									disabled={isDeleting}
								>
									<MoreVertical className="h-4 w-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onClick={handleTestConnection}>
									<Wifi className="mr-2 h-4 w-4" />
									Test Connection
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setShowEditDialog(true)}>
									<Pencil className="mr-2 h-4 w-4" />
									Edit
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									onClick={handleDelete}
									className="text-destructive focus:text-destructive"
								>
									<Trash2 className="mr-2 h-4 w-4" />
									Delete
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="space-y-1">
						<div className="text-xs text-muted-foreground">Server URLs</div>
						<div className="space-y-1">
							{cluster.urls.map((url, index) => (
								<code
									key={`${cluster.id}-url-${index}`}
									className="block text-xs bg-muted px-2 py-1 rounded truncate"
								>
									{url}
								</code>
							))}
						</div>
					</div>

					<div className="flex flex-wrap gap-2">
						{cluster.authType === "token" && (
							<Badge variant="secondary" className="text-xs">
								Token Auth
							</Badge>
						)}
						{cluster.authType === "userpass" && (
							<Badge variant="secondary" className="text-xs">
								User/Pass Auth
							</Badge>
						)}
						{serverInfo?.jetstream && (
							<Badge variant="default" className="text-xs">
								JetStream
							</Badge>
						)}
					</div>

					{status === "connected" && serverInfo && (
						<div className="text-xs text-muted-foreground border-t pt-2">
							<div className="flex items-center gap-1">
								<CheckCircle2 className="h-3 w-3 text-green-500" />
								<span>
									{serverInfo.serverName} v{serverInfo.version}
								</span>
							</div>
						</div>
					)}

					{status === "error" && errorMessage && (
						<div className="text-xs text-destructive border-t pt-2 flex items-start gap-1">
							<WifiOff className="h-3 w-3 mt-0.5 shrink-0" />
							<span>{errorMessage}</span>
						</div>
					)}
				</CardContent>
			</Card>

			<EditClusterDialog
				cluster={cluster}
				open={showEditDialog}
				onOpenChange={setShowEditDialog}
			/>
		</>
	);
}
