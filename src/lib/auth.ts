import { queryOptions } from "@tanstack/react-query";
import { authApi } from "./api";

// Query options for caching
export const setupCheckQueryOptions = () =>
	queryOptions({
		queryKey: ["auth", "setup-check"],
		queryFn: () => authApi.checkSetup(),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});

export const sessionQueryOptions = () =>
	queryOptions({
		queryKey: ["auth", "session"],
		queryFn: () => authApi.getSession(),
		staleTime: 60 * 1000, // 1 minute
	});
