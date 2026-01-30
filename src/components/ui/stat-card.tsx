import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type IconColor = "blue" | "green" | "amber" | "red" | "purple" | "primary";

interface StatCardProps {
	title: string;
	value: string | number;
	subtitle?: string;
	icon: LucideIcon;
	iconColor?: IconColor;
	trend?: {
		value: number;
		label?: string;
	};
	className?: string;
}

const iconColorClasses: Record<IconColor, string> = {
	blue: "icon-container-blue",
	green: "icon-container-green",
	amber: "icon-container-amber",
	red: "icon-container-red",
	purple: "icon-container-purple",
	primary: "icon-container-primary",
};

export function StatCard({
	title,
	value,
	subtitle,
	icon: Icon,
	iconColor = "primary",
	trend,
	className,
}: StatCardProps) {
	const isPositive = trend && trend.value >= 0;

	return (
		<Card className={cn("relative overflow-hidden", className)}>
			<CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
				<p className="text-sm font-medium text-muted-foreground">{title}</p>
				<div className={cn("icon-container icon-container-md", iconColorClasses[iconColor])}>
					<Icon className="h-5 w-5" />
				</div>
			</CardHeader>
			<CardContent>
				<div className="flex items-baseline gap-2">
					<span className="stat-value">{value}</span>
					{trend && (
						<span
							className={cn(
								"trend-badge",
								isPositive ? "trend-badge-up" : "trend-badge-down"
							)}
						>
							{isPositive ? (
								<ArrowUp className="h-3 w-3" />
							) : (
								<ArrowDown className="h-3 w-3" />
							)}
							{Math.abs(trend.value)}%
						</span>
					)}
				</div>
				{subtitle && <p className="stat-label mt-1">{subtitle}</p>}
			</CardContent>
		</Card>
	);
}
