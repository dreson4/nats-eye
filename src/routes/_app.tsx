import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { CommandPalette } from "@/components/command-palette";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
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
	// Enable keyboard shortcuts
	useKeyboardShortcuts();

	return (
		<SidebarProvider>
			<AppSidebar />
			<SidebarInset className="bg-gradient-page safe-area-top">
				<Outlet />
			</SidebarInset>
			<CommandPalette />
		</SidebarProvider>
	);
}
