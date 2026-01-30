import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Wifi } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { clustersApi, type TestConnectionResult } from "@/lib/api";

type AuthType = "none" | "token" | "userpass";

interface AddClusterDialogProps {
	trigger?: React.ReactNode;
	onSuccess?: () => void;
}

export function AddClusterDialog({ trigger, onSuccess }: AddClusterDialogProps) {
	const queryClient = useQueryClient();
	const nameId = useId();
	const tokenId = useId();
	const usernameId = useId();
	const passwordId = useId();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [urls, setUrls] = useState<string[]>([""]);
	const [authType, setAuthType] = useState<AuthType>("none");
	const [token, setToken] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

	const resetForm = () => {
		setName("");
		setUrls([""]);
		setAuthType("none");
		setToken("");
		setUsername("");
		setPassword("");
		setError("");
		setTestResult(null);
	};

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			resetForm();
		}
	};

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
				setTestResult(null);
				return;
			}
		}

		const newUrls = [...urls];
		newUrls[index] = value;
		setUrls(newUrls);
		setTestResult(null);
	};

	const getAuthConfig = () => {
		switch (authType) {
			case "token":
				return { token: token || undefined };
			case "userpass":
				return { username: username || undefined, password: password || undefined };
			default:
				return {};
		}
	};

	const handleTestConnection = async () => {
		setError("");
		setTestResult(null);

		const validUrls = urls
			.map((url) => url.trim())
			.filter((url) => url !== "");
		if (validUrls.length === 0) {
			setError("Please enter at least one URL");
			return;
		}

		setIsTesting(true);
		try {
			const result = await clustersApi.testConnection(validUrls, getAuthConfig());
			setTestResult(result);
		} catch {
			setTestResult({ success: false, error: "Failed to test connection" });
		} finally {
			setIsTesting(false);
		}
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

		if (authType === "token" && !token.trim()) {
			setError("Token is required");
			return;
		}

		if (authType === "userpass" && (!username.trim() || !password.trim())) {
			setError("Username and password are required");
			return;
		}

		setIsLoading(true);
		try {
			await clustersApi.create({
				name: name.trim(),
				urls: validUrls,
				authType,
				...getAuthConfig(),
			});
			await queryClient.invalidateQueries({ queryKey: ["clusters"] });
			handleOpenChange(false);
			onSuccess?.();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add cluster");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild>
				{trigger || (
					<Button>
						<Plus className="mr-2 h-4 w-4" />
						Add Cluster
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Add NATS Cluster</DialogTitle>
					<DialogDescription>
						Connect to a NATS server using its WebSocket endpoint.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}

						{testResult && (
							<div
								className={`rounded-md p-3 text-sm ${
									testResult.success
										? "bg-green-500/10 text-green-600 dark:text-green-400"
										: "bg-destructive/10 text-destructive"
								}`}
							>
								{testResult.success ? (
									<div className="space-y-1">
										<div className="font-medium">Connection successful</div>
										{testResult.serverInfo && (
											<div className="text-xs opacity-80">
												{testResult.serverInfo.serverName} v
												{testResult.serverInfo.version}
												{testResult.serverInfo.jetstream && " (JetStream enabled)"}
											</div>
										)}
									</div>
								) : (
									<div>{testResult.error || "Connection failed"}</div>
								)}
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
							<p className="text-xs text-muted-foreground">
								Add multiple URLs for cluster redundancy
							</p>
						</div>

						<div className="space-y-2">
							<Label>Authentication</Label>
							<Select
								value={authType}
								onValueChange={(value: AuthType) => {
									setAuthType(value);
									setTestResult(null);
								}}
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
									placeholder="Enter authentication token"
									value={token}
									onChange={(e) => {
										setToken(e.target.value);
										setTestResult(null);
									}}
									disabled={isLoading}
								/>
							</div>
						)}

						{authType === "userpass" && (
							<>
								<div className="space-y-2">
									<Label htmlFor={usernameId}>Username</Label>
									<Input
										id={usernameId}
										type="text"
										placeholder="Enter username"
										value={username}
										onChange={(e) => {
											setUsername(e.target.value);
											setTestResult(null);
										}}
										disabled={isLoading}
									/>
								</div>
								<div className="space-y-2">
									<Label htmlFor={passwordId}>Password</Label>
									<Input
										id={passwordId}
										type="password"
										placeholder="Enter password"
										value={password}
										onChange={(e) => {
											setPassword(e.target.value);
											setTestResult(null);
										}}
										disabled={isLoading}
									/>
								</div>
							</>
						)}
					</div>
					<DialogFooter className="flex-col gap-2 sm:flex-row">
						<Button
							type="button"
							variant="outline"
							onClick={handleTestConnection}
							disabled={isLoading || isTesting}
						>
							{isTesting ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Testing...
								</>
							) : (
								<>
									<Wifi className="mr-2 h-4 w-4" />
									Test Connection
								</>
							)}
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Adding...
								</>
							) : (
								"Add Cluster"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
