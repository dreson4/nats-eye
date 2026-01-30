import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Database,
	Eye,
	Layers,
	LayoutDashboard,
	LogOut,
	Server,
	Settings,
	Users,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
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

const navItems = [
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
];

const clusterNavItems = [
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
];

export function AppSidebar() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	const handleLogout = async () => {
		await authApi.logout();
		await queryClient.invalidateQueries({ queryKey: ["auth"] });
		window.location.href = "/login";
	};

	return (
		<Sidebar collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size="lg" asChild>
							<Link to="/dashboard">
								<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
									<Eye className="size-4" />
								</div>
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
				<SidebarGroup>
					<SidebarGroupLabel>Navigation</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{navItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={currentPath === item.url}
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

				<SidebarGroup>
					<SidebarGroupLabel>JetStream</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{clusterNavItems.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={currentPath.startsWith(item.url)}
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
						<div className="flex items-center justify-between px-2 py-1">
							<ThemeToggle />
						</div>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<SidebarMenuButton tooltip="Logout" onClick={handleLogout}>
							<LogOut />
							<span>Logout</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>

			<SidebarRail />
		</Sidebar>
	);
}
