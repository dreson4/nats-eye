import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme {
	if (typeof window === "undefined") return "system";
	return (localStorage.getItem("theme") as Theme) || "system";
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
		theme === "system" ? getSystemTheme() : theme,
	);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem("theme", newTheme);
	}, []);

	useEffect(() => {
		const resolved = theme === "system" ? getSystemTheme() : theme;
		setResolvedTheme(resolved);

		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(resolved);
	}, [theme]);

	useEffect(() => {
		if (theme !== "system") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => {
			const resolved = getSystemTheme();
			setResolvedTheme(resolved);
			document.documentElement.classList.remove("light", "dark");
			document.documentElement.classList.add(resolved);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme]);

	return {
		theme,
		setTheme,
		resolvedTheme,
	};
}
