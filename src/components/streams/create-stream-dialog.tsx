import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { streamsApi, type CreateStreamData } from "@/lib/api";

interface CreateStreamDialogProps {
	clusterId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateStreamDialog({
	clusterId,
	open,
	onOpenChange,
}: CreateStreamDialogProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [subjects, setSubjects] = useState<string[]>([]);
	const [subjectInput, setSubjectInput] = useState("");
	const [retention, setRetention] = useState<"limits" | "interest" | "workqueue">("limits");
	const [storage, setStorage] = useState<"file" | "memory">("file");
	const [discard, setDiscard] = useState<"old" | "new">("old");
	const [maxMsgs, setMaxMsgs] = useState("");
	const [maxBytes, setMaxBytes] = useState("");
	const [maxAge, setMaxAge] = useState("");
	const [maxMsgSize, setMaxMsgSize] = useState("");
	const [replicas, setReplicas] = useState("1");
	const [error, setError] = useState("");

	const createMutation = useMutation({
		mutationFn: (data: CreateStreamData) => streamsApi.create(clusterId, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["streams", clusterId] });
			resetForm();
			onOpenChange(false);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to create stream");
		},
	});

	const resetForm = () => {
		setName("");
		setDescription("");
		setSubjects([]);
		setSubjectInput("");
		setRetention("limits");
		setStorage("file");
		setDiscard("old");
		setMaxMsgs("");
		setMaxBytes("");
		setMaxAge("");
		setMaxMsgSize("");
		setReplicas("1");
		setError("");
	};

	const handleAddSubject = () => {
		const trimmed = subjectInput.trim();
		if (trimmed && !subjects.includes(trimmed)) {
			setSubjects([...subjects, trimmed]);
			setSubjectInput("");
		}
	};

	const handleRemoveSubject = (subject: string) => {
		setSubjects(subjects.filter((s) => s !== subject));
	};

	const handleSubjectKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddSubject();
		}
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
		if (!match) return Number(trimmed) * 1_000_000_000 || 0; // Assume seconds if no unit

		const num = parseFloat(match[1]);
		const unit = match[2] || "s";

		const multipliers: Record<string, number> = {
			s: 1_000_000_000, // nanoseconds
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
			setError("Stream name is required");
			return;
		}

		if (subjects.length === 0) {
			setError("At least one subject is required");
			return;
		}

		const data: CreateStreamData = {
			name: name.trim(),
			subjects,
			retention,
			storage,
			discard,
			replicas: parseInt(replicas) || 1,
		};

		if (description.trim()) {
			data.description = description.trim();
		}

		if (maxMsgs.trim()) {
			data.maxMsgs = parseInt(maxMsgs) || -1;
		}

		if (maxBytes.trim()) {
			data.maxBytes = parseBytes(maxBytes);
		}

		if (maxAge.trim()) {
			data.maxAge = parseDuration(maxAge);
		}

		if (maxMsgSize.trim()) {
			data.maxMsgSize = parseBytes(maxMsgSize);
		}

		createMutation.mutate(data);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle>Create Stream</DialogTitle>
					<DialogDescription>
						Create a new JetStream stream to store messages.
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
							placeholder="my-stream"
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

					<div className="space-y-2">
						<Label>Subjects *</Label>
						<div className="flex gap-2">
							<Input
								value={subjectInput}
								onChange={(e) => setSubjectInput(e.target.value)}
								onKeyDown={handleSubjectKeyDown}
								placeholder="orders.>"
							/>
							<Button type="button" variant="outline" size="icon" onClick={handleAddSubject}>
								<Plus className="h-4 w-4" />
							</Button>
						</div>
						{subjects.length > 0 && (
							<div className="flex flex-wrap gap-1 mt-2">
								{subjects.map((subject) => (
									<Badge key={subject} variant="secondary" className="gap-1">
										{subject}
										<button
											type="button"
											onClick={() => handleRemoveSubject(subject)}
											className="ml-1 hover:text-destructive"
										>
											<X className="h-3 w-3" />
										</button>
									</Badge>
								))}
							</div>
						)}
						<p className="text-xs text-muted-foreground">
							Use wildcards: * (single token) or {">"} (multiple tokens)
						</p>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Retention</Label>
							<Select value={retention} onValueChange={(v) => setRetention(v as typeof retention)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="limits">Limits</SelectItem>
									<SelectItem value="interest">Interest</SelectItem>
									<SelectItem value="workqueue">Work Queue</SelectItem>
								</SelectContent>
							</Select>
						</div>

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
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Discard Policy</Label>
							<Select value={discard} onValueChange={(v) => setDiscard(v as typeof discard)}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="old">Old</SelectItem>
									<SelectItem value="new">New</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="replicas">Replicas</Label>
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
							<Label htmlFor="maxMsgs">Max Messages</Label>
							<Input
								id="maxMsgs"
								value={maxMsgs}
								onChange={(e) => setMaxMsgs(e.target.value)}
								placeholder="-1 (unlimited)"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="maxBytes">Max Bytes</Label>
							<Input
								id="maxBytes"
								value={maxBytes}
								onChange={(e) => setMaxBytes(e.target.value)}
								placeholder="e.g. 1GB"
							/>
						</div>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="maxAge">Max Age</Label>
							<Input
								id="maxAge"
								value={maxAge}
								onChange={(e) => setMaxAge(e.target.value)}
								placeholder="e.g. 7d, 24h"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="maxMsgSize">Max Message Size</Label>
							<Input
								id="maxMsgSize"
								value={maxMsgSize}
								onChange={(e) => setMaxMsgSize(e.target.value)}
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
							{createMutation.isPending ? "Creating..." : "Create Stream"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
