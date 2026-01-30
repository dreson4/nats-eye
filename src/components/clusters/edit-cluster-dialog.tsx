import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { clustersApi, type AuthType, type ClusterData } from "@/lib/api";

interface EditClusterDialogProps {
	cluster: ClusterData;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function EditClusterDialog({
	cluster,
	open,
	onOpenChange,
}: EditClusterDialogProps) {
	const queryClient = useQueryClient();
	const nameId = useId();
	const tokenId = useId();
	const usernameId = useId();
	const passwordId = useId();

	const [name, setName] = useState(cluster.name);
	const [urls, setUrls] = useState<string[]>(cluster.urls);
	const [authType, setAuthType] = useState<AuthType>(cluster.authType);
	const [token, setToken] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	// Reset form when cluster changes or dialog opens
	useEffect(() => {
		if (open) {
			setName(cluster.name);
			setUrls(cluster.urls.length > 0 ? cluster.urls : [""]);
			setAuthType(cluster.authType);
			setToken("");
			setUsername("");
			setPassword("");
			setError("");
		}
	}, [open, cluster]);

	const addUrl = () => {
		if (urls.length < 10) {
			setUrls([...urls, ""]);
		}
	};

	const removeUrl = (index: number) => {
		if (urls.length > 1) {
			setUrls(urls.filter((_, i) => i !== index));
		}
	};

	const updateUrl = (index: number, value: string) => {
		// Check if pasted value contains commas (multiple URLs)
		if (value.includes(",")) {
			const pastedUrls = value
				.split(",")
				.map((url) => url.trim())
				.filter((url) => url !== "");

			if (pastedUrls.length > 0) {
				const newUrls = [...urls];
				// Replace current index with first URL
				newUrls[index] = pastedUrls[0];
				// Add remaining URLs after current index
				for (let i = 1; i < pastedUrls.length && newUrls.length < 10; i++) {
					newUrls.splice(index + i, 0, pastedUrls[i]);
				}
				setUrls(newUrls);
				return;
			}
		}

		const newUrls = [...urls];
		newUrls[index] = value;
		setUrls(newUrls);
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const validUrls = urls
			.map((url) => url.trim())
			.filter((url) => url !== "");

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		if (validUrls.length === 0) {
			setError("At least one URL is required");
			return;
		}

		setIsLoading(true);
		try {
			const updateData: Parameters<typeof clustersApi.update>[1] = {
				name: name.trim(),
				urls: validUrls,
				authType,
			};

			// Only include auth fields if they have values (to allow keeping existing)
			if (authType === "token" && token) {
				updateData.token = token;
			}
			if (authType === "userpass") {
				if (username) updateData.username = username;
				if (password) updateData.password = password;
			}

			await clustersApi.update(cluster.id, updateData);
			await queryClient.invalidateQueries({ queryKey: ["clusters"] });
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to update cluster");
		} finally {
			setIsLoading(false);
		}
	};

	const hasExistingAuth = () => {
		if (authType === "token") return cluster.hasToken;
		if (authType === "userpass") return cluster.hasUserPass;
		return false;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Edit Cluster</DialogTitle>
					<DialogDescription>
						Update the cluster configuration.
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
							<Label htmlFor={nameId}>Cluster Name</Label>
							<Input
								id={nameId}
								placeholder="My NATS Cluster"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={isLoading}
							/>
						</div>

						<div className="space-y-2">
							<Label>Server URLs</Label>
							<div className="space-y-2">
								{urls.map((url, index) => (
									<div key={`url-${index}`} className="flex gap-2">
										<Input
											placeholder="ws://localhost:8080 or wss://nats.example.com"
											value={url}
											onChange={(e) => updateUrl(index, e.target.value)}
											disabled={isLoading}
										/>
										{urls.length > 1 && (
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => removeUrl(index)}
												disabled={isLoading}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										)}
									</div>
								))}
								{urls.length < 10 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addUrl}
										disabled={isLoading}
									>
										<Plus className="mr-2 h-4 w-4" />
										Add URL
									</Button>
								)}
							</div>
						</div>

						<div className="space-y-2">
							<Label>Authentication</Label>
							<Select
								value={authType}
								onValueChange={(value: AuthType) => setAuthType(value)}
								disabled={isLoading}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select auth type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">No Authentication</SelectItem>
									<SelectItem value="token">Token</SelectItem>
									<SelectItem value="userpass">Username & Password</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{authType === "token" && (
							<div className="space-y-2">
								<Label htmlFor={tokenId}>Token</Label>
								<Input
									id={tokenId}
									type="password"
									placeholder={hasExistingAuth() ? "Leave blank to keep current" : "Enter authentication token"}
									value={token}
									onChange={(e) => setToken(e.target.value)}
									disabled={isLoading}
								/>
								{hasExistingAuth() && (
									<p className="text-xs text-muted-foreground">
										Leave blank to keep the existing token
									</p>
								)}
							</div>
						)}

						{authType === "userpass" && (
							<>
								<div className="space-y-2">
									<Label htmlFor={usernameId}>Username</Label>
									<Input
										id={usernameId}
										type="text"
										placeholder={hasExistingAuth() ? "Leave blank to keep current" : "Enter username"}
										value={username}
										onChange={(e) => setUsername(e.target.value)}
										disabled={isLoading}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={passwordId}>Password</Label>
									<Input
										id={passwordId}
										type="password"
										placeholder={hasExistingAuth() ? "Leave blank to keep current" : "Enter password"}
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										disabled={isLoading}
									/>
								</div>
								{hasExistingAuth() && (
									<p className="text-xs text-muted-foreground">
										Leave fields blank to keep existing credentials
									</p>
								)}
							</>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Saving...
								</>
							) : (
								"Save Changes"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
