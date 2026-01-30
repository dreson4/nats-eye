import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { sessionQueryOptions, setupCheckQueryOptions } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
	beforeLoad: async ({ context }) => {
		// Check if setup is needed (cached)
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

		// Return user for context
		return { user };
	},
	component: AppLayout,
});

function AppLayout() {
	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset>
				<Outlet />
			</SidebarInset>
		</SidebarProvider>
	);
}
