import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/lib/api";
import { setupCheckQueryOptions } from "@/lib/auth";

export const Route = createFileRoute("/setup")({
	beforeLoad: async ({ context }) => {
		// Check if setup is needed (cached)
		const { needsSetup } = await context.queryClient.ensureQueryData(
			setupCheckQueryOptions(),
		);
		if (!needsSetup) {
			// Setup already complete, redirect to login
			throw redirect({ to: "/login" });
		}
	},
	component: SetupPage,
});

function SetupPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const usernameId = useId();
	const passwordId = useId();
	const confirmPasswordId = useId();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		// Validate passwords match
		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		// Validate password length
		if (password.length < 8) {
			setError("Password must be at least 8 characters");
			return;
		}

		// Validate username length
		if (username.length < 3) {
			setError("Username must be at least 3 characters");
			return;
		}

		setIsLoading(true);

		try {
			const result = await authApi.setup(username, password);
			if (result.success) {
				// Invalidate auth queries and hard redirect to login
				await queryClient.invalidateQueries({ queryKey: ["auth"] });
				window.location.href = "/login";
			} else {
				setError(result.error || "Setup failed");
			}
		} catch {
			setError("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<img
						src="/logo.webp"
						alt="NATS Eye"
						className="mx-auto mb-4 h-16 w-16 rounded-xl object-contain"
					/>
					<CardTitle className="text-2xl">Welcome to NATS Eye</CardTitle>
					<CardDescription>
						Create your admin account to get started
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="flex items-center gap-2 rounded-md bg-muted p-3 text-sm text-muted-foreground">
							<ShieldCheck className="h-4 w-4 shrink-0" />
							<span>
								This account will have full access to manage all clusters and
								settings.
							</span>
						</div>

						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor={usernameId}>Username</Label>
							<Input
								id={usernameId}
								type="text"
								placeholder="Choose a username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								disabled={isLoading}
								autoComplete="username"
								autoFocus
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={passwordId}>Password</Label>
							<Input
								id={passwordId}
								type="password"
								placeholder="Choose a strong password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								disabled={isLoading}
								autoComplete="new-password"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor={confirmPasswordId}>Confirm Password</Label>
							<Input
								id={confirmPasswordId}
								type="password"
								placeholder="Confirm your password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !isLoading) {
										e.preventDefault();
										e.currentTarget.form?.requestSubmit();
									}
								}}
								disabled={isLoading}
								autoComplete="new-password"
							/>
						</div>
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Creating account...
								</>
							) : (
								"Create Admin Account"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
