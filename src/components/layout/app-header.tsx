import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

interface AppHeaderProps {
	title: string;
	breadcrumbs?: { label: string; href?: string }[];
	children?: React.ReactNode;
}

export function AppHeader({ title, breadcrumbs, children }: AppHeaderProps) {
	return (
		<header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
			<SidebarTrigger className="-ml-1" />
			<Separator orientation="vertical" className="mr-2 h-4" />
			{breadcrumbs && breadcrumbs.length > 0 ? (
				<Breadcrumb>
					<BreadcrumbList>
						{breadcrumbs.map((crumb, index) => (
							<BreadcrumbItem key={crumb.label}>
								{index < breadcrumbs.length - 1 ? (
									<>
										<BreadcrumbLink href={crumb.href}>
											{crumb.label}
										</BreadcrumbLink>
										<BreadcrumbSeparator />
									</>
								) : (
									<BreadcrumbPage>{crumb.label}</BreadcrumbPage>
								)}
							</BreadcrumbItem>
						))}
					</BreadcrumbList>
				</Breadcrumb>
			) : (
				<h1 className="text-lg font-semibold">{title}</h1>
			)}
			{children && <div className="ml-auto flex items-center gap-2">{children}</div>}
		</header>
	);
}
