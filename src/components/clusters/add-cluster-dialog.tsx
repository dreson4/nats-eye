import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
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
import { clustersApi, type TestConnectionResult, type TestMonitoringResult } from "@/lib/api";

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
	const [natsUrls, setNatsUrls] = useState<string[]>([""]);
	const [monitoringUrls, setMonitoringUrls] = useState<string[]>([""]);
	const [authType, setAuthType] = useState<AuthType>("none");
	const [token, setToken] = useState("");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isTestingWs, setIsTestingWs] = useState(false);
	const [isTestingNats, setIsTestingNats] = useState(false);
	const [isTestingMonitoring, setIsTestingMonitoring] = useState(false);
	const [wsTestResult, setWsTestResult] = useState<TestConnectionResult | null>(null);
	const [natsTestResult, setNatsTestResult] = useState<TestConnectionResult | null>(null);
	const [monitoringTestResult, setMonitoringTestResult] = useState<TestMonitoringResult | null>(null);

	const resetForm = () => {
		setName("");
		setUrls([""]);
		setNatsUrls([""]);
		setMonitoringUrls([""]);
		setAuthType("none");
		setToken("");
		setUsername("");
		setPassword("");
		setError("");
		setWsTestResult(null);
		setNatsTestResult(null);
		setMonitoringTestResult(null);
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
				setWsTestResult(null);
				return;
			}
		}

		const newUrls = [...urls];
		newUrls[index] = value;
		setUrls(newUrls);
		setWsTestResult(null);
	};

	const addNatsUrl = () => {
		if (natsUrls.length < 10) {
			setNatsUrls([...natsUrls, ""]);
		}
	};

	const removeNatsUrl = (index: number) => {
		if (natsUrls.length > 1) {
			setNatsUrls(natsUrls.filter((_, i) => i !== index));
		}
	};

	const updateNatsUrl = (index: number, value: string) => {
		// Check if pasted value contains commas (multiple URLs)
		if (value.includes(",")) {
			const pastedUrls = value
				.split(",")
				.map((url) => url.trim())
				.filter((url) => url !== "");

			if (pastedUrls.length > 0) {
				const newUrls = [...natsUrls];
				newUrls[index] = pastedUrls[0];
				for (let i = 1; i < pastedUrls.length && newUrls.length < 10; i++) {
					newUrls.splice(index + i, 0, pastedUrls[i]);
				}
				setNatsUrls(newUrls);
				return;
			}
		}

		const newUrls = [...natsUrls];
		newUrls[index] = value;
		setNatsUrls(newUrls);
		setNatsTestResult(null);
	};

	const addMonitoringUrl = () => {
		if (monitoringUrls.length < 10) {
			setMonitoringUrls([...monitoringUrls, ""]);
		}
	};

	const removeMonitoringUrl = (index: number) => {
		if (monitoringUrls.length > 1) {
			setMonitoringUrls(monitoringUrls.filter((_, i) => i !== index));
		}
	};

	const updateMonitoringUrl = (index: number, value: string) => {
		if (value.includes(",")) {
			const pastedUrls = value
				.split(",")
				.map((url) => url.trim())
				.filter((url) => url !== "");

			if (pastedUrls.length > 0) {
				const newUrls = [...monitoringUrls];
				newUrls[index] = pastedUrls[0];
				for (let i = 1; i < pastedUrls.length && newUrls.length < 10; i++) {
					newUrls.splice(index + i, 0, pastedUrls[i]);
				}
				setMonitoringUrls(newUrls);
				return;
			}
		}

		const newUrls = [...monitoringUrls];
		newUrls[index] = value;
		setMonitoringUrls(newUrls);
		setMonitoringTestResult(null);
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

	const handleTestWs = async () => {
		setError("");
		setWsTestResult(null);

		const validUrls = urls.map((url) => url.trim()).filter((url) => url !== "");
		if (validUrls.length === 0) {
			setError("Please enter at least one WebSocket URL");
			return;
		}

		setIsTestingWs(true);
		try {
			const result = await clustersApi.testConnection(validUrls, getAuthConfig());
			setWsTestResult(result);
		} catch {
			setWsTestResult({ success: false, error: "Failed to test connection" });
		} finally {
			setIsTestingWs(false);
		}
	};

	const handleTestNats = async () => {
		setError("");
		setNatsTestResult(null);

		const validUrls = natsUrls.map((url) => url.trim()).filter((url) => url !== "");
		if (validUrls.length === 0) {
			setError("Please enter at least one NATS URL");
			return;
		}

		setIsTestingNats(true);
		try {
			const result = await clustersApi.testNatsConnection(validUrls, getAuthConfig());
			setNatsTestResult(result);
		} catch {
			setNatsTestResult({ success: false, error: "Failed to test connection" });
		} finally {
			setIsTestingNats(false);
		}
	};

	const handleTestMonitoring = async () => {
		setError("");
		setMonitoringTestResult(null);

		const validUrls = monitoringUrls.map((url) => url.trim()).filter((url) => url !== "");
		if (validUrls.length === 0) {
			setError("Please enter at least one Monitoring URL");
			return;
		}

		setIsTestingMonitoring(true);
		try {
			const result = await clustersApi.testMonitoringConnection(validUrls);
			setMonitoringTestResult(result);
		} catch {
			setMonitoringTestResult({ success: false, results: [] });
		} finally {
			setIsTestingMonitoring(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		const validUrls = urls
			.map((url) => url.trim())
			.filter((url) => url !== "");

		const validNatsUrls = natsUrls
			.map((url) => url.trim())
			.filter((url) => url !== "");

		const validMonitoringUrls = monitoringUrls
			.map((url) => url.trim())
			.filter((url) => url !== "");

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		if (validUrls.length === 0) {
			setError("At least one WebSocket URL is required");
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
				natsUrls: validNatsUrls.length > 0 ? validNatsUrls : undefined,
				authType,
				monitoringUrls: validMonitoringUrls.length > 0 ? validMonitoringUrls : undefined,
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
							<div className="flex items-center justify-between">
								<Label>WebSocket URLs (for browser)</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={handleTestWs}
									disabled={isLoading || isTestingWs}
								>
									{isTestingWs ? (
										<Loader2 className="mr-1 h-3 w-3 animate-spin" />
									) : wsTestResult ? (
										wsTestResult.success ? (
											<Check className="mr-1 h-3 w-3 text-green-500" />
										) : (
											<X className="mr-1 h-3 w-3 text-destructive" />
										)
									) : null}
									Test
								</Button>
							</div>
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
							{wsTestResult && (
								<div
									className={`rounded-md p-2 text-xs ${
										wsTestResult.success
											? "bg-green-500/10 text-green-600 dark:text-green-400"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{wsTestResult.success ? (
										<>
											Connected{wsTestResult.serverInfo && <> &mdash; {wsTestResult.serverInfo.serverName} v{wsTestResult.serverInfo.version}{wsTestResult.serverInfo.jetstream && " (JetStream)"}</>}
										</>
									) : (
										<>{wsTestResult.error || "Connection failed"}</>
									)}
								</div>
							)}
							<p className="text-xs text-muted-foreground">
								WebSocket URLs for browser connections (required)
							</p>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>NATS URLs (for server - optional)</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={handleTestNats}
									disabled={isLoading || isTestingNats || !natsUrls.some((u) => u.trim())}
								>
									{isTestingNats ? (
										<Loader2 className="mr-1 h-3 w-3 animate-spin" />
									) : natsTestResult ? (
										natsTestResult.success ? (
											<Check className="mr-1 h-3 w-3 text-green-500" />
										) : (
											<X className="mr-1 h-3 w-3 text-destructive" />
										)
									) : null}
									Test
								</Button>
							</div>
							<div className="space-y-2">
								{natsUrls.map((url, index) => (
									<div key={`nats-url-${index}`} className="flex gap-2">
										<Input
											placeholder="localhost:4222 or nats://nats.example.com:4222"
											value={url}
											onChange={(e) => updateNatsUrl(index, e.target.value)}
											disabled={isLoading}
										/>
										{natsUrls.length > 1 && (
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => removeNatsUrl(index)}
												disabled={isLoading}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										)}
									</div>
								))}
								{natsUrls.length < 10 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addNatsUrl}
										disabled={isLoading}
									>
										<Plus className="mr-2 h-4 w-4" />
										Add URL
									</Button>
								)}
							</div>
							{natsTestResult && (
								<div
									className={`rounded-md p-2 text-xs ${
										natsTestResult.success
											? "bg-green-500/10 text-green-600 dark:text-green-400"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{natsTestResult.success ? (
										<>
											Connected{natsTestResult.serverInfo && <> &mdash; {natsTestResult.serverInfo.serverName} v{natsTestResult.serverInfo.version}{natsTestResult.serverInfo.jetstream && " (JetStream)"}</>}
										</>
									) : (
										<>{natsTestResult.error || "Connection failed"}</>
									)}
								</div>
							)}
							<p className="text-xs text-muted-foreground">
								TCP URLs for server-side operations like file uploads (e.g., localhost:4222)
							</p>
						</div>

						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>Monitoring URLs (optional)</Label>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-6 px-2 text-xs"
									onClick={handleTestMonitoring}
									disabled={isLoading || isTestingMonitoring || !monitoringUrls.some((u) => u.trim())}
								>
									{isTestingMonitoring ? (
										<Loader2 className="mr-1 h-3 w-3 animate-spin" />
									) : monitoringTestResult ? (
										monitoringTestResult.success ? (
											<Check className="mr-1 h-3 w-3 text-green-500" />
										) : (
											<X className="mr-1 h-3 w-3 text-destructive" />
										)
									) : null}
									Test
								</Button>
							</div>
							<div className="space-y-2">
								{monitoringUrls.map((url, index) => (
									<div key={`monitoring-url-${index}`} className="flex gap-2">
										<Input
											placeholder="http://localhost:8222"
											value={url}
											onChange={(e) => updateMonitoringUrl(index, e.target.value)}
											disabled={isLoading}
										/>
										{monitoringUrls.length > 1 && (
											<Button
												type="button"
												variant="outline"
												size="icon"
												onClick={() => removeMonitoringUrl(index)}
												disabled={isLoading}
											>
												<Trash2 className="h-4 w-4" />
											</Button>
										)}
									</div>
								))}
								{monitoringUrls.length < 10 && (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={addMonitoringUrl}
										disabled={isLoading}
									>
										<Plus className="mr-2 h-4 w-4" />
										Add URL
									</Button>
								)}
							</div>
							{monitoringTestResult && (
								<div
									className={`rounded-md p-2 text-xs ${
										monitoringTestResult.success
											? "bg-green-500/10 text-green-600 dark:text-green-400"
											: "bg-destructive/10 text-destructive"
									}`}
								>
									{monitoringTestResult.results.map((r) => (
										<div key={r.url} className="flex items-center gap-1">
											{r.success ? (
												<Check className="h-3 w-3 text-green-500 shrink-0" />
											) : (
												<X className="h-3 w-3 text-destructive shrink-0" />
											)}
											<span className="truncate">{r.url}</span>
											{r.success && r.serverName && <span className="opacity-70"> &mdash; {r.serverName} v{r.version}</span>}
											{!r.success && r.error && <span className="opacity-70"> &mdash; {r.error}</span>}
										</div>
									))}
								</div>
							)}
							<p className="text-xs text-muted-foreground">
								HTTP monitoring endpoints for server stats (e.g., http://localhost:8222)
							</p>
						</div>

						<div className="space-y-2">
							<Label>Authentication</Label>
							<Select
								value={authType}
								onValueChange={(value: AuthType) => {
									setAuthType(value);
									setWsTestResult(null);
									setNatsTestResult(null);
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
										setWsTestResult(null);
										setNatsTestResult(null);
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
											setWsTestResult(null);
											setNatsTestResult(null);
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
											setWsTestResult(null);
											setNatsTestResult(null);
										}}
										disabled={isLoading}
									/>
								</div>
							</>
						)}
					</div>
					<DialogFooter>
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
