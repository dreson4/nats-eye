import { useNavigate } from "@tanstack/react-router";
import {
	Activity,
	Database,
	FolderArchive,
	Layers,
	LayoutDashboard,
	Moon,
	Plus,
	Server,
	Settings,
	Sun,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { useTheme } from "@/hooks/use-theme";

const navigationItems = [
	{
		title: "Dashboard",
		url: "/dashboard",
		icon: LayoutDashboard,
		keywords: ["home", "overview"],
	},
	{
		title: "Clusters",
		url: "/clusters",
		icon: Server,
		keywords: ["servers", "connections"],
	},
	{
		title: "Streams",
		url: "/streams",
		icon: Layers,
		keywords: ["jetstream", "messages"],
	},
	{
		title: "Consumers",
		url: "/consumers",
		icon: Users,
		keywords: ["jetstream", "subscribers"],
	},
	{
		title: "KV Store",
		url: "/kv",
		icon: Database,
		keywords: ["key-value", "storage"],
	},
	{
		title: "Object Store",
		url: "/objectstore",
		icon: FolderArchive,
		keywords: ["files", "blobs"],
	},
	{
		title: "Monitoring",
		url: "/monitoring",
		icon: Activity,
		keywords: ["metrics", "health", "connections"],
	},
	{
		title: "Settings",
		url: "/settings",
		icon: Settings,
		keywords: ["preferences", "config"],
	},
];

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();
	const { theme, setTheme } = useTheme();

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((open) => !open);
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	const handleSelect = (url: string) => {
		setOpen(false);
		navigate({ to: url });
	};

	const toggleTheme = () => {
		setTheme(theme === "dark" ? "light" : "dark");
		setOpen(false);
	};

	return (
		<CommandDialog open={open} onOpenChange={setOpen}>
			<CommandInput placeholder="Type a command or search..." />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroup heading="Navigation">
					{navigationItems.map((item) => (
						<CommandItem
							key={item.url}
							value={`${item.title} ${item.keywords.join(" ")}`}
							onSelect={() => handleSelect(item.url)}
						>
							<item.icon className="mr-2 h-4 w-4" />
							<span>{item.title}</span>
						</CommandItem>
					))}
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading="Actions">
					<CommandItem onSelect={() => handleSelect("/clusters")}>
						<Plus className="mr-2 h-4 w-4" />
						<span>Add Cluster</span>
					</CommandItem>
					<CommandItem onSelect={() => handleSelect("/streams")}>
						<Plus className="mr-2 h-4 w-4" />
						<span>Create Stream</span>
					</CommandItem>
				</CommandGroup>
				<CommandSeparator />
				<CommandGroup heading="Theme">
					<CommandItem onSelect={toggleTheme}>
						{theme === "dark" ? (
							<Sun className="mr-2 h-4 w-4" />
						) : (
							<Moon className="mr-2 h-4 w-4" />
						)}
						<span>Toggle {theme === "dark" ? "Light" : "Dark"} Mode</span>
					</CommandItem>
				</CommandGroup>
			</CommandList>
		</CommandDialog>
	);
}
