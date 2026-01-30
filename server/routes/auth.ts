import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import {
	createSession,
	createUser,
	deleteSession,
	getSession,
	getUserByUsername,
	getUserCount,
	updateUser,
} from "../db";

const SESSION_COOKIE_NAME = "nats_eye_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Allow insecure cookies for self-hosters using HTTP (Tailscale, local network, etc.)
// Set SECURE_COOKIES=true if you're using HTTPS
const SECURE_COOKIES = process.env.SECURE_COOKIES === "true";

// Password hashing using Bun's built-in crypto
async function hashPassword(password: string): Promise<string> {
	return Bun.password.hash(password, {
		algorithm: "bcrypt",
		cost: 10,
	});
}

async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	return Bun.password.verify(password, hash);
}

const auth = new Hono();

// Check if setup is needed
auth.get("/setup-check", (c) => {
	const userCount = getUserCount();
	return c.json({ needsSetup: userCount === 0 });
});

// Get current session
auth.get("/session", (c) => {
	const sessionId = getCookie(c, SESSION_COOKIE_NAME);
	if (!sessionId) {
		return c.json({ user: null });
	}

	const session = getSession(sessionId);
	if (!session) {
		deleteCookie(c, SESSION_COOKIE_NAME);
		return c.json({ user: null });
	}

	return c.json({
		user: {
			id: session.user.id,
			username: session.user.username,
		},
	});
});

// Login
const loginSchema = z.object({
	username: z.string().min(1),
	password: z.string().min(1),
});

auth.post("/login", zValidator("json", loginSchema), async (c) => {
	const { username, password } = c.req.valid("json");

	// Find user
	const user = getUserByUsername(username);
	if (!user) {
		return c.json({ success: false, error: "Invalid username or password" }, 401);
	}

	// Verify password
	const isValid = await verifyPassword(password, user.password_hash);
	if (!isValid) {
		return c.json({ success: false, error: "Invalid username or password" }, 401);
	}

	// Create session
	const session = createSession(user.id);

	// Set session cookie
	setCookie(c, SESSION_COOKIE_NAME, session.id, {
		httpOnly: true,
		secure: SECURE_COOKIES,
		sameSite: "Lax",
		maxAge: SESSION_MAX_AGE,
		path: "/",
	});

	return c.json({
		success: true,
		user: {
			id: user.id,
			username: user.username,
		},
	});
});

// Logout
auth.post("/logout", (c) => {
	const sessionId = getCookie(c, SESSION_COOKIE_NAME);
	if (sessionId) {
		deleteSession(sessionId);
		deleteCookie(c, SESSION_COOKIE_NAME);
	}
	return c.json({ success: true });
});

// Setup admin (first user)
const setupSchema = z.object({
	username: z.string().min(3, "Username must be at least 3 characters"),
	password: z.string().min(8, "Password must be at least 8 characters"),
});

auth.post("/setup", zValidator("json", setupSchema), async (c) => {
	// Check if setup is already complete
	const userCount = getUserCount();
	if (userCount > 0) {
		return c.json({ success: false, error: "Setup already complete" }, 400);
	}

	const { username, password } = c.req.valid("json");

	// Hash password and create user
	const passwordHash = await hashPassword(password);
	const user = createUser(username, passwordHash);

	if (!user) {
		return c.json({ success: false, error: "Failed to create user" }, 500);
	}

	return c.json({ success: true });
});

// Update user credentials
const updateUserSchema = z.object({
	username: z.string().min(3, "Username must be at least 3 characters").optional(),
	currentPassword: z.string().min(1, "Current password is required"),
	newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
});

auth.patch("/user", zValidator("json", updateUserSchema), async (c) => {
	// Verify session
	const sessionId = getCookie(c, SESSION_COOKIE_NAME);
	if (!sessionId) {
		return c.json({ success: false, error: "Not authenticated" }, 401);
	}

	const session = getSession(sessionId);
	if (!session) {
		return c.json({ success: false, error: "Invalid session" }, 401);
	}

	const { username, currentPassword, newPassword } = c.req.valid("json");

	// Verify current password
	const isValid = await verifyPassword(currentPassword, session.user.password_hash);
	if (!isValid) {
		return c.json({ success: false, error: "Current password is incorrect" }, 400);
	}

	// Check if new username is taken (if changing username)
	if (username && username !== session.user.username) {
		const existingUser = getUserByUsername(username);
		if (existingUser) {
			return c.json({ success: false, error: "Username already taken" }, 400);
		}
	}

	// Build update data
	const updateData: { username?: string; password_hash?: string } = {};
	if (username) {
		updateData.username = username;
	}
	if (newPassword) {
		updateData.password_hash = await hashPassword(newPassword);
	}

	if (Object.keys(updateData).length === 0) {
		return c.json({ success: false, error: "No changes provided" }, 400);
	}

	// Update user
	const updatedUser = updateUser(session.user.id, updateData);
	if (!updatedUser) {
		return c.json({ success: false, error: "Failed to update user" }, 500);
	}

	return c.json({
		success: true,
		user: {
			id: updatedUser.id,
			username: updatedUser.username,
		},
	});
});

export default auth;
