import { createFileRoute, redirect } from "@tanstack/react-router";
import { sessionQueryOptions, setupCheckQueryOptions } from "@/lib/auth";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		// Check if setup is needed first (cached)
		const { needsSetup } = await context.queryClient.ensureQueryData(
			setupCheckQueryOptions(),
		);
		if (needsSetup) {
			throw redirect({ to: "/setup" });
		}

		// Check if user is logged in (cached)
		const { user } = await context.queryClient.ensureQueryData(
			sessionQueryOptions(),
		);
		if (!user) {
			throw redirect({ to: "/login" });
		}

		// User is logged in, go to dashboard
		throw redirect({ to: "/dashboard" });
	},
});
