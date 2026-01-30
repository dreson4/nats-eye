import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import {
	Activity,
	Database,
	FolderArchive,
	Layers,
	LayoutDashboard,
	LogOut,
	Server,
	Settings,
	Users,
} from "lucide-react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
} from "@/components/ui/sidebar";
import { authApi } from "@/lib/api";

const navSections = [
	{
		label: "Overview",
		items: [
			{
				title: "Dashboard",
				url: "/dashboard",
				icon: LayoutDashboard,
			},
			{
				title: "Clusters",
				url: "/clusters",
				icon: Server,
			},
		],
	},
	{
		label: "JetStream",
		items: [
			{
				title: "Streams",
				url: "/streams",
				icon: Layers,
			},
			{
				title: "Consumers",
				url: "/consumers",
				icon: Users,
			},
			{
				title: "KV Store",
				url: "/kv",
				icon: Database,
			},
			{
				title: "Object Store",
				url: "/objectstore",
				icon: FolderArchive,
			},
		],
	},
	{
		label: "Operations",
		items: [
			{
				title: "Monitoring",
				url: "/monitoring",
				icon: Activity,
			},
		],
	},
];

export function AppSidebar() {
	const queryClient = useQueryClient();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const { theme, setTheme, resolvedTheme } = useTheme();

	const handleLogout = async () => {
		await authApi.logout();
		await queryClient.invalidateQueries({ queryKey: ["auth"] });
		window.location.href = "/login";
	};

	const isActive = (url: string) => {
		if (url === "/dashboard") return currentPath === url;
		return currentPath.startsWith(url);
	};

	const cycleTheme = () => {
		if (theme === "light") setTheme("dark");
		else if (theme === "dark") setTheme("system");
		else setTheme("light");
	};

	const themeLabel = theme === "system" ? "System" : theme === "dark" ? "Dark" : "Light";

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/dashboard">
								<img
									src="/logo.webp"
									alt="NATS Eye"
									className="size-8 rounded-lg object-contain"
								/>
								<div className="flex flex-col gap-0.5 leading-none">
									<span className="font-semibold">NATS Eye</span>
									<span className="text-xs text-muted-foreground">
										Cluster Manager
									</span>
								</div>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			<SidebarContent>
				{navSections.map((section) => (
					<SidebarGroup key={section.label}>
						<SidebarGroupLabel className="nav-section-label">
							{section.label}
						</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{section.items.map((item) => (
									<SidebarMenuItem key={item.title}>
										<SidebarMenuButton
											asChild
											isActive={isActive(item.url)}
											tooltip={item.title}
										>
											<Link to={item.url}>
												<item.icon />
												<span>{item.title}</span>
											</Link>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton asChild tooltip="Settings">
							<Link to="/settings">
								<Settings />
								<span>Settings</span>
							</Link>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip={`Theme: ${themeLabel}`} onClick={cycleTheme}>
							{resolvedTheme === "dark" ? <Moon /> : <Sun />}
							<span>{themeLabel}</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Logout" onClick={handleLogout}>
							<LogOut />
							<span>Logout</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
				<div className="px-3 py-2 text-xs text-muted-foreground">
					Press <kbd className="bg-muted px-1 py-0.5 rounded text-[10px]">⌘K</kbd> for commands
				</div>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
