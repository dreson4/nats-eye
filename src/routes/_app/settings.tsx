import { createFileRoute } from "@tanstack/react-router";
import { useId } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { useTheme } from "@/components/theme-provider";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
				</div>
			</div>
		</>
	);
}
