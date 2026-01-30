import { queryOptions } from "@tanstack/react-query";
import { clustersApi } from "./api";

export type { ClusterData, TestConnectionResult } from "./api";

// Query options for caching
export const clustersQueryOptions = () =>
	queryOptions({
		queryKey: ["clusters"],
		queryFn: () => clustersApi.getAll(),
		staleTime: 30 * 1000, // 30 seconds
	});

export const clusterQueryOptions = (id: string) =>
	queryOptions({
		queryKey: ["clusters", id],
		queryFn: () => clustersApi.getById(id),
		staleTime: 30 * 1000,
	});
