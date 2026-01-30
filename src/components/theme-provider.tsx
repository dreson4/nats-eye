import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";

type Theme = "light" | "dark" | "system";

interface ThemeContextValue {
	theme: Theme;
	setTheme: (theme: Theme) => void;
	resolvedTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

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

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setThemeState] = useState<Theme>("system");
	const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const stored = getStoredTheme();
		setThemeState(stored);
		const resolved = stored === "system" ? getSystemTheme() : stored;
		setResolvedTheme(resolved);
	}, []);

	const setTheme = useCallback((newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem("theme", newTheme);
	}, []);

	useEffect(() => {
		if (!mounted) return;
		const resolved = theme === "system" ? getSystemTheme() : theme;
		setResolvedTheme(resolved);

		const root = document.documentElement;
		root.classList.remove("light", "dark");
		root.classList.add(resolved);
	}, [theme, mounted]);

	useEffect(() => {
		if (!mounted || theme !== "system") return;

		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleChange = () => {
			const resolved = getSystemTheme();
			setResolvedTheme(resolved);
			document.documentElement.classList.remove("light", "dark");
			document.documentElement.classList.add(resolved);
		};

		mediaQuery.addEventListener("change", handleChange);
		return () => mediaQuery.removeEventListener("change", handleChange);
	}, [theme, mounted]);

	return (
		<ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}
