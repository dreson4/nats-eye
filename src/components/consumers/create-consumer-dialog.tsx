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
import { consumersApi, type CreateConsumerData } from "@/lib/api";

interface CreateConsumerDialogProps {
	clusterId: string;
	streamName: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateConsumerDialog({
	clusterId,
	streamName,
	open,
	onOpenChange,
}: CreateConsumerDialogProps) {
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [filterSubject, setFilterSubject] = useState("");
	const [deliverPolicy, setDeliverPolicy] = useState<CreateConsumerData["deliverPolicy"]>("all");
	const [ackPolicy, setAckPolicy] = useState<CreateConsumerData["ackPolicy"]>("explicit");
	const [maxDeliver, setMaxDeliver] = useState("-1");
	const [error, setError] = useState("");

	const resetForm = () => {
		setName("");
		setDescription("");
		setFilterSubject("");
		setDeliverPolicy("all");
		setAckPolicy("explicit");
		setMaxDeliver("-1");
		setError("");
	};

	const mutation = useMutation({
		mutationFn: (data: CreateConsumerData) =>
			consumersApi.create(clusterId, streamName, data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["consumers", clusterId] });
			queryClient.invalidateQueries({ queryKey: ["streams", clusterId] });
			resetForm();
			onOpenChange(false);
		},
		onError: (err) => {
			setError(err instanceof Error ? err.message : "Failed to create consumer");
		},
	});

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		setError("");

		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
			setError("Name can only contain letters, numbers, underscores, and hyphens");
			return;
		}

		const data: CreateConsumerData = {
			name: name.trim(),
			description: description.trim() || undefined,
			filterSubject: filterSubject.trim() || undefined,
			deliverPolicy,
			ackPolicy,
			maxDeliver: Number.parseInt(maxDeliver) || -1,
		};

		mutation.mutate(data);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) resetForm();
				onOpenChange(o);
			}}
		>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>Create Consumer</DialogTitle>
					<DialogDescription>
						Create a new consumer for stream "{streamName}"
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
							placeholder="my-consumer"
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
						<Label htmlFor="filterSubject">Filter Subject</Label>
						<Input
							id="filterSubject"
							value={filterSubject}
							onChange={(e) => setFilterSubject(e.target.value)}
							placeholder="orders.* or leave empty for all"
						/>
						<p className="text-xs text-muted-foreground">
							Only receive messages matching this subject pattern
						</p>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Deliver Policy</Label>
							<Select value={deliverPolicy} onValueChange={(v) => setDeliverPolicy(v as CreateConsumerData["deliverPolicy"])}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="last">Last</SelectItem>
									<SelectItem value="new">New</SelectItem>
									<SelectItem value="last_per_subject">Last Per Subject</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label>Ack Policy</Label>
							<Select value={ackPolicy} onValueChange={(v) => setAckPolicy(v as CreateConsumerData["ackPolicy"])}>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="explicit">Explicit</SelectItem>
									<SelectItem value="all">All</SelectItem>
									<SelectItem value="none">None</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="maxDeliver">Max Deliver</Label>
						<Input
							id="maxDeliver"
							type="number"
							value={maxDeliver}
							onChange={(e) => setMaxDeliver(e.target.value)}
							min="-1"
						/>
						<p className="text-xs text-muted-foreground">
							Maximum delivery attempts (-1 for unlimited)
						</p>
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button type="submit" disabled={mutation.isPending}>
							{mutation.isPending ? "Creating..." : "Create Consumer"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
