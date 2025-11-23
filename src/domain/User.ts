import { randomUUID } from 'crypto';

export type UserRole = 'user' | 'admin';
export type ApprovalStatus = 'pending_profile' | 'pending_review' | 'approved' | 'rejected';

export interface UserProps {
	githubId: string;
	githubUsername: string;
	avatarUrl: string;
	role: UserRole;
	id?: string;
	registrationDate?: Date;
	lastLogin?: Date;
	approvalStatus?: ApprovalStatus;
	karmaPoints?: number;
	badges?: string[];
}

/**
 * User domain entity representing a CodePals user
 * Follows Domain-Driven Design principles with encapsulated business logic
 */
export class User {
	private constructor(
		public readonly id: string,
		public readonly githubId: string,
		public readonly githubUsername: string,
		public readonly avatarUrl: string,
		public readonly registrationDate: Date,
		public lastLogin: Date,
		public approvalStatus: ApprovalStatus,
		public readonly role: UserRole,
		public karmaPoints: number,
		public readonly badges: string[]
	) {}

	/**
	 * Factory method to create a new User
	 * @param props User properties
	 * @returns User instance
	 */
	static create(props: UserProps): User {
		// Validation
		if (!props.githubId || props.githubId.trim() === '') {
			throw new Error('GitHub ID is required');
		}

		if (!props.githubUsername || props.githubUsername.trim() === '') {
			throw new Error('GitHub username is required');
		}

		if (!this.isValidUrl(props.avatarUrl)) {
			throw new Error('Invalid avatar URL');
		}

		const now = new Date();

		return new User(
			props.id || `user-${randomUUID()}`,
			props.githubId,
			props.githubUsername,
			props.avatarUrl,
			props.registrationDate || now,
			props.lastLogin || now,
			props.approvalStatus || 'pending_profile',
			props.role,
			props.karmaPoints || 0,
			props.badges || []
		);
	}

	/**
	 * Reconstruct User from database/JSON
	 */
	static fromJSON(
		data: UserProps & { id: string; registrationDate: string | Date; lastLogin: string | Date }
	): User {
		return new User(
			data.id,
			data.githubId,
			data.githubUsername,
			data.avatarUrl,
			new Date(data.registrationDate),
			new Date(data.lastLogin),
			data.approvalStatus || 'pending_profile',
			data.role,
			data.karmaPoints || 0,
			data.badges || []
		);
	}

	/**
	 * Validate URL format
	 */
	private static isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Update last login timestamp
	 */
	updateLastLogin(): void {
		Object.assign(this, { lastLogin: new Date() });
	}

	/**
	 * Approve user profile
	 */
	approve(): void {
		Object.assign(this, { approvalStatus: 'approved' as ApprovalStatus });
	}

	/**
	 * Reject user profile
	 */
	reject(): void {
		Object.assign(this, { approvalStatus: 'rejected' as ApprovalStatus });
	}

	/**
	 * Check if user is approved
	 */
	isApproved(): boolean {
		return this.approvalStatus === 'approved';
	}

	/**
	 * Check if user is admin
	 */
	isAdmin(): boolean {
		return this.role === 'admin';
	}

	/**
	 * Add karma points
	 */
	addKarma(points: number): void {
		if (points < 0) {
			throw new Error('Karma points cannot be negative');
		}
		Object.assign(this, { karmaPoints: this.karmaPoints + points });
	}

	/**
	 * Add badge (no duplicates)
	 */
	addBadge(badgeId: string): void {
		if (!this.badges.includes(badgeId)) {
			this.badges.push(badgeId);
		}
	}

	/**
	 * Serialize to plain object for database storage
	 */
	toJSON() {
		return {
			id: this.id,
			githubId: this.githubId,
			githubUsername: this.githubUsername,
			avatarUrl: this.avatarUrl,
			registrationDate: this.registrationDate,
			lastLogin: this.lastLogin,
			approvalStatus: this.approvalStatus,
			role: this.role,
			karmaPoints: this.karmaPoints,
			badges: this.badges,
		};
	}
}
