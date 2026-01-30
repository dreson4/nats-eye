import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { monitoringApi, type AlertMetric, type AlertCondition } from "@/lib/api";

interface CreateAlertDialogProps {
	clusterId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const metricOptions: { value: AlertMetric; label: string; description: string }[] = [
	{ value: "connections", label: "Connections", description: "Number of active client connections" },
	{ value: "subscriptions", label: "Subscriptions", description: "Number of active subscriptions" },
	{ value: "slow_consumers", label: "Slow Consumers", description: "Number of slow consumers" },
	{ value: "in_msgs_rate", label: "Messages In", description: "Total messages received" },
	{ value: "out_msgs_rate", label: "Messages Out", description: "Total messages sent" },
];

const conditionOptions: { value: AlertCondition; label: string; symbol: string }[] = [
	{ value: "gt", label: "Greater than", symbol: ">" },
	{ value: "gte", label: "Greater or equal", symbol: ">=" },
	{ value: "lt", label: "Less than", symbol: "<" },
	{ value: "lte", label: "Less or equal", symbol: "<=" },
];

export function CreateAlertDialog({
	clusterId,
	open,
	onOpenChange,
}: CreateAlertDialogProps) {
	const queryClient = useQueryClient();
	const nameId = useId();
	const thresholdId = useId();

	const [name, setName] = useState("");
	const [metric, setMetric] = useState<AlertMetric>("connections");
	const [condition, setCondition] = useState<AlertCondition>("gt");
	const [threshold, setThreshold] = useState("");
	const [error, setError] = useState("");
	const [isLoading, setIsLoading] = useState(false);

	const resetForm = () => {
		setName("");
		setMetric("connections");
		setCondition("gt");
		setThreshold("");
		setError("");
	};

	const handleOpenChange = (newOpen: boolean) => {
		onOpenChange(newOpen);
		if (!newOpen) {
			resetForm();
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		const thresholdNum = Number.parseFloat(threshold);
		if (Number.isNaN(thresholdNum)) {
			setError("Threshold must be a valid number");
			return;
		}

		setIsLoading(true);
		try {
			await monitoringApi.createAlert({
				clusterId,
				name: name.trim(),
				metric,
				condition,
				threshold: thresholdNum,
				enabled: true,
			});
			await queryClient.invalidateQueries({ queryKey: ["monitoring", "alerts"] });
			handleOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create alert");
		} finally {
			setIsLoading(false);
		}
	};

	const selectedMetric = metricOptions.find((m) => m.value === metric);
	const selectedCondition = conditionOptions.find((c) => c.value === condition);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>Create Alert</DialogTitle>
					<DialogDescription>
						Configure an alert to monitor server metrics.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit}>
					<div className="grid gap-4 py-4">
						{error && (
							<div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
								{error}
							</div>
						)}

						<div className="space-y-2">
							<Label htmlFor={nameId}>Alert Name</Label>
							<Input
								id={nameId}
								placeholder="e.g., High Connection Count"
								value={name}
								onChange={(e) => setName(e.target.value)}
								disabled={isLoading}
							/>
						</div>

						<div className="space-y-2">
							<Label>Metric</Label>
							<Select
								value={metric}
								onValueChange={(value: AlertMetric) => setMetric(value)}
								disabled={isLoading}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select metric" />
								</SelectTrigger>
								<SelectContent>
									{metricOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{selectedMetric && (
								<p className="text-xs text-muted-foreground">
									{selectedMetric.description}
								</p>
							)}
						</div>

						<div className="space-y-2">
							<Label>Condition</Label>
							<Select
								value={condition}
								onValueChange={(value: AlertCondition) => setCondition(value)}
								disabled={isLoading}
							>
								<SelectTrigger>
									<SelectValue placeholder="Select condition" />
								</SelectTrigger>
								<SelectContent>
									{conditionOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.symbol} {option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor={thresholdId}>Threshold</Label>
							<Input
								id={thresholdId}
								type="number"
								placeholder="e.g., 100"
								value={threshold}
								onChange={(e) => setThreshold(e.target.value)}
								disabled={isLoading}
							/>
						</div>

						{/* Preview */}
						{name && threshold && (
							<div className="rounded-md bg-muted p-3">
								<p className="text-sm font-medium">Alert Preview:</p>
								<p className="text-sm text-muted-foreground mt-1">
									"{name}" will trigger when{" "}
									<span className="font-mono text-foreground">
										{selectedMetric?.label} {selectedCondition?.symbol} {threshold}
									</span>
								</p>
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => handleOpenChange(false)}
							disabled={isLoading}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={isLoading}>
							{isLoading ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									Creating...
								</>
							) : (
								"Create Alert"
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
