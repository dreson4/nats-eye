import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

const navigationShortcuts: Record<string, string> = {
	d: "/dashboard",
	c: "/clusters",
	s: "/streams",
	o: "/consumers", // 'o' for cOnsumers since 'c' is taken
	k: "/kv",
	b: "/objectstore", // 'b' for bloBs/bucket
	m: "/monitoring",
	",": "/settings",
};

export function useKeyboardShortcuts() {
	const navigate = useNavigate();
	const pendingKey = useRef<string | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			const target = e.target as HTMLElement;
			if (
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable
			) {
				return;
			}

			// Don't trigger shortcuts when modifier keys are pressed (except for Cmd+K which is handled by CommandPalette)
			if (e.metaKey || e.ctrlKey || e.altKey) {
				return;
			}

			const key = e.key.toLowerCase();

			// Handle "g" prefix for navigation
			if (key === "g") {
				pendingKey.current = "g";
				// Reset pending key after 1 second
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
				timeoutRef.current = setTimeout(() => {
					pendingKey.current = null;
				}, 1000);
				return;
			}

			// Handle navigation shortcuts (g + key)
			if (pendingKey.current === "g" && navigationShortcuts[key]) {
				e.preventDefault();
				pendingKey.current = null;
				if (timeoutRef.current) {
					clearTimeout(timeoutRef.current);
				}
				navigate({ to: navigationShortcuts[key] });
				return;
			}

			// Reset pending key on any other key
			pendingKey.current = null;
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [navigate]);
}
