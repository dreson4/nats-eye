import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
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
import { sessionQueryOptions, setupCheckQueryOptions } from "@/lib/auth";

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		// Check if setup is needed (cached)
		const { needsSetup } = await context.queryClient.ensureQueryData(
			setupCheckQueryOptions(),
		);
		if (needsSetup) {
			throw redirect({ to: "/setup" });
		}

		// Check if already logged in (cached)
		const { user } = await context.queryClient.ensureQueryData(
			sessionQueryOptions(),
		);
		if (user) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const usernameId = useId();
	const passwordId = useId();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setIsLoading(true);

		try {
			const result = await authApi.login(username, password);
			if (result.success) {
				// Invalidate auth queries and hard redirect to dashboard
				await queryClient.invalidateQueries({ queryKey: ["auth"] });
				window.location.href = "/dashboard";
			} else {
				setError(result.error || "Login failed");
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
					<CardTitle className="text-2xl">Welcome back</CardTitle>
					<CardDescription>Sign in to your NATS Eye account</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
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
								placeholder="Enter your username"
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
								placeholder="Enter your password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter" && !isLoading) {
										e.preventDefault();
										e.currentTarget.form?.requestSubmit();
									}
								}}
								disabled={isLoading}
								autoComplete="current-password"
							/>
						</div>
						<Button type="submit" className="w-full" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Signing in...
								</>
							) : (
								"Sign in"
							)}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
