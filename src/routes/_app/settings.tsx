import { createFileRoute } from "@tanstack/react-router";
import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/app-header";
import { useTheme } from "@/components/theme-provider";
import { authApi } from "@/lib/api";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const { theme, setTheme } = useTheme();
	const alertsId = useId();
	const updatesId = useId();
	const queryClient = useQueryClient();

	// Account form state
	const [username, setUsername] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");

	const updateUserMutation = useMutation({
		mutationFn: authApi.updateUser,
		onSuccess: (data) => {
			if (data.success) {
				toast.success("Account updated successfully");
				// Clear form
				setUsername("");
				setCurrentPassword("");
				setNewPassword("");
				setConfirmPassword("");
				// Refresh session data
				queryClient.invalidateQueries({ queryKey: ["session"] });
			} else {
				toast.error(data.error || "Failed to update account");
			}
		},
		onError: (error) => {
			toast.error(error.message || "Failed to update account");
		},
	});

	const handleUpdateAccount = (e: React.FormEvent) => {
		e.preventDefault();

		if (!currentPassword) {
			toast.error("Current password is required");
			return;
		}

		if (newPassword && newPassword !== confirmPassword) {
			toast.error("New passwords do not match");
			return;
		}

		if (!username && !newPassword) {
			toast.error("Please provide a new username or password");
			return;
		}

		updateUserMutation.mutate({
			username: username || undefined,
			currentPassword,
			newPassword: newPassword || undefined,
		});
	};

	return (
		<>
			<AppHeader title="Settings" />
			<div className="page-content">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">Settings</h2>
					<p className="text-muted-foreground">
						Manage your application preferences
					</p>
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Appearance</CardTitle>
							<CardDescription>
								Customize how NATS Eye looks on your device
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor="theme">Theme</Label>
									<p className="text-sm text-muted-foreground">
										Select your preferred theme
									</p>
								</div>
								<Select
									value={theme}
									onValueChange={(v) =>
										setTheme(v as "light" | "dark" | "system")
									}
								>
									<SelectTrigger className="w-32">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="light">Light</SelectItem>
										<SelectItem value="dark">Dark</SelectItem>
										<SelectItem value="system">System</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Notifications</CardTitle>
							<CardDescription>
								Configure notification preferences
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor={alertsId}>Cluster Alerts</Label>
									<p className="text-sm text-muted-foreground">
										Get notified when clusters go offline
									</p>
								</div>
								<Switch id={alertsId} />
							</div>
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label htmlFor={updatesId}>Stream Updates</Label>
									<p className="text-sm text-muted-foreground">
										Notify on stream configuration changes
									</p>
								</div>
								<Switch id={updatesId} />
							</div>
						</CardContent>
					</Card>

					<Card className="md:col-span-2">
						<CardHeader>
							<CardTitle>Account</CardTitle>
							<CardDescription>
								Update your username or password
							</CardDescription>
						</CardHeader>
						<CardContent>
							<form onSubmit={handleUpdateAccount} className="space-y-4">
								<div className="grid gap-4 md:grid-cols-2">
									<div className="space-y-2">
										<Label htmlFor="username">New Username</Label>
										<Input
											id="username"
											placeholder="Leave blank to keep current"
											value={username}
											onChange={(e) => setUsername(e.target.value)}
											minLength={3}
										/>
										<p className="text-xs text-muted-foreground">
											Minimum 3 characters
										</p>
									</div>
									<div className="space-y-2">
										<Label htmlFor="currentPassword">
											Current Password <span className="text-destructive">*</span>
										</Label>
										<Input
											id="currentPassword"
											type="password"
											placeholder="Enter your current password"
											value={currentPassword}
											onChange={(e) => setCurrentPassword(e.target.value)}
											required
										/>
									</div>
									<div className="space-y-2">
										<Label htmlFor="newPassword">New Password</Label>
										<Input
											id="newPassword"
											type="password"
											placeholder="Leave blank to keep current"
											value={newPassword}
											onChange={(e) => setNewPassword(e.target.value)}
											minLength={8}
										/>
										<p className="text-xs text-muted-foreground">
											Minimum 8 characters
										</p>
									</div>
									<div className="space-y-2">
										<Label htmlFor="confirmPassword">Confirm New Password</Label>
										<Input
											id="confirmPassword"
											type="password"
											placeholder="Confirm your new password"
											value={confirmPassword}
											onChange={(e) => setConfirmPassword(e.target.value)}
											disabled={!newPassword}
										/>
									</div>
								</div>
								<Button
									type="submit"
									disabled={updateUserMutation.isPending}
								>
									{updateUserMutation.isPending ? "Updating..." : "Update Account"}
								</Button>
							</form>
						</CardContent>
					</Card>
				</div>
			</div>
		</>
	);
}
