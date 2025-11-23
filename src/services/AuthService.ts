import jwt from 'jsonwebtoken';
import { User } from '../domain/User';
import { UserRepository } from '../infrastructure/UserRepository';

export interface GitHubUser {
	id: string;
	login: string;
	avatar_url: string;
}

export interface SessionPayload {
	userId: string;
	githubId: string;
	githubUsername: string;
	avatarUrl: string;
	role: 'user' | 'admin';
}

/**
 * Authentication service handling OAuth flow and JWT generation
 */
export class AuthService {
	constructor(
		private userRepository: UserRepository,
		private jwtSecret: string,
		private githubClientId: string,
		private githubClientSecret: string
	) {}

	/**
	 * Get GitHub OAuth authorization URL
	 */
	getGitHubAuthUrl(callbackUrl: string): string {
		const params = new URLSearchParams({
			client_id: this.githubClientId,
			redirect_uri: callbackUrl,
			scope: 'read:user user:email',
		});

		return `https://github.com/login/oauth/authorize?${params.toString()}`;
	}

	/**
	 * Exchange GitHub OAuth code for access token
	 */
	async getGitHubAccessToken(code: string): Promise<string> {
		const response = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				client_id: this.githubClientId,
				client_secret: this.githubClientSecret,
				code,
			}),
		});

		const data = (await response.json()) as { access_token?: string; error?: string };

		if (data.error || !data.access_token) {
			throw new Error(`GitHub OAuth error: ${data.error || 'No access token'}`);
		}

		return data.access_token;
	}

	/**
	 * Get GitHub user info using access token
	 */
	async getGitHubUser(accessToken: string): Promise<GitHubUser> {
		const response = await fetch('https://api.github.com/user', {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: 'application/vnd.github.v3+json',
			},
		});

		if (!response.ok) {
			throw new Error('Failed to fetch GitHub user');
		}

		const data = (await response.json()) as GitHubUser;
		return data;
	}

	/**
	 * Create or update user from GitHub OAuth
	 */
	async createOrUpdateUser(githubUser: GitHubUser): Promise<User> {
		const existingUser = await this.userRepository.findByGithubId(String(githubUser.id));

		if (existingUser) {
			existingUser.updateLastLogin();
			return await this.userRepository.update(existingUser);
		}

		const newUser = User.create({
			githubId: String(githubUser.id),
			githubUsername: githubUser.login,
			avatarUrl: githubUser.avatar_url,
			role: 'user',
		});

		return await this.userRepository.create(newUser);
	}

	/**
	 * Generate JWT token for authenticated user
	 */
	generateToken(user: User): string {
		const payload: SessionPayload = {
			userId: user.id,
			githubId: user.githubId,
			githubUsername: user.githubUsername,
			avatarUrl: user.avatarUrl,
			role: user.role,
		};

		return jwt.sign(payload, this.jwtSecret, {
			expiresIn: '7d',
		});
	}

	/**
	 * Verify JWT token and return payload
	 */
	verifyToken(token: string): SessionPayload | null {
		try {
			return jwt.verify(token, this.jwtSecret) as SessionPayload;
		} catch {
			return null;
		}
	}

	/**
	 * Complete OAuth flow: exchange code for user and generate JWT
	 */
	async handleOAuthCallback(code: string): Promise<{ user: User; token: string }> {
		const accessToken = await this.getGitHubAccessToken(code);
		const githubUser = await this.getGitHubUser(accessToken);
		const user = await this.createOrUpdateUser(githubUser);
		const token = this.generateToken(user);

		return { user, token };
	}
}
