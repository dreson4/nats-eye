import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/_app/consumers")({
	component: ConsumersPage,
});

function ConsumersPage() {
	return (
		<>
			<AppHeader title="Consumers" />
			<div className="flex flex-1 flex-col gap-4 p-4">
				<div>
					<h2 className="text-2xl font-bold tracking-tight">Consumers</h2>
					<p className="text-muted-foreground">
						Manage JetStream consumers across your clusters
					</p>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Users className="h-5 w-5" />
							No Consumers Available
						</CardTitle>
						<CardDescription>
							Connect to a cluster to view and manage consumers
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Consumers will appear here once you connect to a NATS cluster and
							create streams with consumers.
						</p>
					</CardContent>
				</Card>
			</div>
		</>
	);
}
