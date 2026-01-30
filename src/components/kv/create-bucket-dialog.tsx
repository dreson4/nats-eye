import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { kvApi, type CreateKvBucketData } from "@/lib/api";

interface CreateKvBucketDialogProps {
	clusterId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateKvBucketDialog({
	clusterId,
	open,
	onOpenChange,
}: CreateKvBucketDialogProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [storage, setStorage] = useState<"file" | "memory">("file");
	const [history, setHistory] = useState("1");
	const [ttl, setTtl] = useState("");
	const [maxBytes, setMaxBytes] = useState("");
	const [maxValueSize, setMaxValueSize] = useState("");
	const [replicas, setReplicas] = useState("1");
	const [error, setError] = useState("");

	const createMutation = useMutation({
		mutationFn: (data: CreateKvBucketData) => kvApi.createBucket(clusterId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["kv-buckets", clusterId] });
			resetForm();
			onOpenChange(false);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to create bucket");
		},
	});

	const resetForm = () => {
		setName("");
		setDescription("");
		setStorage("file");
		setHistory("1");
		setTtl("");
		setMaxBytes("");
		setMaxValueSize("");
		setReplicas("1");
		setError("");
	};

	const parseBytes = (value: string): number => {
		const trimmed = value.trim().toUpperCase();
		if (!trimmed) return -1;

		const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)?$/);
		if (!match) return Number(trimmed) || -1;

		const num = parseFloat(match[1]);
		const unit = match[2] || "B";

		const multipliers: Record<string, number> = {
			B: 1,
			KB: 1024,
			MB: 1024 * 1024,
			GB: 1024 * 1024 * 1024,
			TB: 1024 * 1024 * 1024 * 1024,
		};

		return Math.floor(num * multipliers[unit]);
	};

	const parseDuration = (value: string): number => {
		const trimmed = value.trim().toLowerCase();
		if (!trimmed) return 0;

		const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$/);
		if (!match) return Number(trimmed) * 1_000_000_000 || 0;

		const num = parseFloat(match[1]);
		const unit = match[2] || "s";

		const multipliers: Record<string, number> = {
			s: 1_000_000_000,
			m: 60 * 1_000_000_000,
			h: 60 * 60 * 1_000_000_000,
			d: 24 * 60 * 60 * 1_000_000_000,
		};

		return Math.floor(num * multipliers[unit]);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!name.trim()) {
			setError("Bucket name is required");
			return;
		}

		const data: CreateKvBucketData = {
			name: name.trim(),
			storage,
			history: parseInt(history) || 1,
			replicas: parseInt(replicas) || 1,
		};

		if (description.trim()) {
			data.description = description.trim();
		}

		if (ttl.trim()) {
			data.ttl = parseDuration(ttl);
		}

		if (maxBytes.trim()) {
			data.maxBytes = parseBytes(maxBytes);
		}

		if (maxValueSize.trim()) {
			data.maxValueSize = parseBytes(maxValueSize);
		}

		createMutation.mutate(data);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle>Create KV Bucket</DialogTitle>
					<DialogDescription>
						Create a new Key-Value bucket to store data.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{error && (
						<div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
							{error}
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="name">Name *</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="my-bucket"
							pattern="^[a-zA-Z0-9_-]+$"
						/>
						<p className="text-xs text-muted-foreground">
							Letters, numbers, underscores, and hyphens only
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea
							id="description"
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Optional description..."
							rows={2}
						/>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Storage</Label>
							<Select value={storage} onValueChange={(v) => setStorage(v as typeof storage)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="file">File</SelectItem>
									<SelectItem value="memory">Memory</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>History</Label>
							<Select value={history} onValueChange={setHistory}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">1 revision</SelectItem>
									<SelectItem value="5">5 revisions</SelectItem>
									<SelectItem value="10">10 revisions</SelectItem>
									<SelectItem value="64">64 revisions</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="ttl">TTL</Label>
							<Input
								id="ttl"
								value={ttl}
								onChange={(e) => setTtl(e.target.value)}
								placeholder="e.g. 1h, 7d"
							/>
						</div>

						<div className="space-y-2">
							<Label>Replicas</Label>
							<Select value={replicas} onValueChange={setReplicas}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="1">1</SelectItem>
									<SelectItem value="3">3</SelectItem>
									<SelectItem value="5">5</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="maxBytes">Max Size</Label>
							<Input
								id="maxBytes"
								value={maxBytes}
								onChange={(e) => setMaxBytes(e.target.value)}
								placeholder="e.g. 1GB"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="maxValueSize">Max Value Size</Label>
							<Input
								id="maxValueSize"
								value={maxValueSize}
								onChange={(e) => setMaxValueSize(e.target.value)}
								placeholder="e.g. 1MB"
							/>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? "Creating..." : "Create Bucket"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
