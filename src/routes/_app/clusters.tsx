import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Server } from "lucide-react";
import { AddClusterDialog } from "@/components/clusters/add-cluster-dialog";
import { ClusterCard } from "@/components/clusters/cluster-card";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { clustersQueryOptions } from "@/lib/clusters";

export const Route = createFileRoute("/_app/clusters")({
	component: ClustersPage,
});

function ClustersPage() {
	const { data: clusters, isLoading } = useQuery(clustersQueryOptions());

	return (
		<>
			<AppHeader title="Clusters" />
			<div className="flex flex-1 flex-col gap-4 p-4">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-2xl font-bold tracking-tight">Clusters</h2>
						<p className="text-muted-foreground">
							Manage your NATS cluster connections
						</p>
					</div>
					<AddClusterDialog />
				</div>

				{isLoading ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{[1, 2, 3].map((i) => (
							<Card key={i}>
								<CardHeader className="pb-2">
									<Skeleton className="h-6 w-32" />
								</CardHeader>
								<CardContent className="space-y-3">
									<Skeleton className="h-4 w-full" />
									<Skeleton className="h-4 w-3/4" />
								</CardContent>
							</Card>
						))}
					</div>
				) : clusters && clusters.length > 0 ? (
					<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
						{clusters.map((cluster) => (
							<ClusterCard key={cluster.id} cluster={cluster} />
						))}
					</div>
				) : (
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<Server className="h-5 w-5" />
								No Clusters Connected
							</CardTitle>
							<CardDescription>
								Add your first NATS cluster to start monitoring
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground mb-4">
								Connect to your NATS servers by providing the WebSocket URL (e.g.,
								ws://localhost:8080 or wss://nats.example.com).
							</p>
							<AddClusterDialog
								trigger={
									<Button variant="outline">
										<Plus className="mr-2 h-4 w-4" />
										Add Your First Cluster
									</Button>
								}
							/>
						</CardContent>
					</Card>
				)}
			</div>
		</>
	);
}
