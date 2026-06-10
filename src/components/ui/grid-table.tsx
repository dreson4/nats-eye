import { createContext, useContext } from "react";

import { cn } from "@/lib/utils";

/**
 * A div/CSS-grid based "table" used for clickable list rows.
 *
 * Why this exists instead of the semantic <table>: we make whole rows
 * navigable with a real <Link> + an `after:absolute after:inset-0` overlay.
 * That overlay needs the row to be its containing block (a positioned
 * ancestor). `position: relative` on a <tr>/<td> is unreliable in mobile
 * WebKit (iOS Safari/Chrome) — the overlay escapes up to the next positioned
 * ancestor (the scroll container), so every row's overlay stacks over the
 * whole table and taps open the wrong item. A <div> with `position: relative`
 * always establishes a containing block, so the overlay stays inside its row.
 *
 * The shared grid-template-columns is provided via context so the header and
 * every row stay perfectly aligned.
 */

const GridColsContext = createContext<string>("");

function GridTable({
	cols,
	className,
	children,
	...props
}: React.ComponentProps<"div"> & { cols: string }) {
	return (
		<div className="relative w-full overflow-x-auto">
			<GridColsContext.Provider value={cols}>
				<div
					data-slot="grid-table"
					role="table"
					className={cn("w-full caption-bottom text-sm", className)}
					{...props}
				>
					{children}
				</div>
			</GridColsContext.Provider>
		</div>
	);
}

function GridHeaderRow({ className, ...props }: React.ComponentProps<"div">) {
	const cols = useContext(GridColsContext);
	return (
		<div
			role="row"
			className={cn(
				"text-muted-foreground grid items-center border-b font-medium",
				cols,
				className,
			)}
			{...props}
		/>
	);
}

function GridRow({ className, ...props }: React.ComponentProps<"div">) {
	const cols = useContext(GridColsContext);
	return (
		<div
			role="row"
			className={cn(
				"group hover:bg-muted/50 relative grid items-center border-b transition-colors last:border-0",
				cols,
				className,
			)}
			{...props}
		/>
	);
}

function GridHead({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			role="columnheader"
			className={cn(
				"text-foreground flex h-10 items-center px-2 font-medium whitespace-nowrap",
				className,
			)}
			{...props}
		/>
	);
}

function GridCell({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			role="cell"
			className={cn(
				"min-w-0 px-2 py-2 align-middle whitespace-nowrap",
				className,
			)}
			{...props}
		/>
	);
}

export { GridTable, GridHeaderRow, GridRow, GridHead, GridCell };
