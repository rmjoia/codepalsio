import { randomUUID } from 'crypto';

export type Availability = 'available' | 'busy' | 'unavailable';

export interface ProfileProps {
	userId: string;
	displayName: string;
	bio: string;
	skills: string[];
	interests: string[];
	availability: Availability;
	id?: string;
	location?: string;
	timezone?: string;
	githubUrl?: string;
	linkedinUrl?: string;
	websiteUrl?: string;
	preferredLanguages?: string[];
	yearsOfExperience?: number;
}

/**
 * Profile domain entity representing a CodePals user profile
 * Follows Domain-Driven Design principles with encapsulated business logic
 */
export class Profile {
	private constructor(
		public readonly id: string,
		public readonly userId: string,
		public readonly displayName: string,
		public bio: string,
		public readonly skills: string[],
		public readonly interests: string[],
		public availability: Availability,
		public location?: string,
		public timezone?: string,
		public githubUrl?: string,
		public linkedinUrl?: string,
		public websiteUrl?: string,
		public preferredLanguages?: string[],
		public yearsOfExperience?: number
	) {}

	/**
	 * Factory method to create a new Profile
	 * @param props Profile properties
	 * @returns Profile instance
	 */
	static create(props: ProfileProps): Profile {
		// Validation
		if (!props.userId || props.userId.trim() === '') {
			throw new Error('User ID is required');
		}

		if (!props.displayName || props.displayName.trim() === '') {
			throw new Error('Display name is required');
		}

		if (!props.bio || props.bio.trim() === '') {
			throw new Error('Bio is required');
		}

		if (props.bio.length > 500) {
			throw new Error('Bio must not exceed 500 characters');
		}

		if (!props.skills || props.skills.length === 0) {
			throw new Error('At least one skill is required');
		}

		if (!props.interests || props.interests.length === 0) {
			throw new Error('At least one interest is required');
		}

		return new Profile(
			props.id || `profile-${randomUUID()}`,
			props.userId,
			props.displayName,
			props.bio,
			[...props.skills], // Copy to prevent external mutation
			[...props.interests], // Copy to prevent external mutation
			props.availability,
			props.location,
			props.timezone,
			props.githubUrl,
			props.linkedinUrl,
			props.websiteUrl,
			props.preferredLanguages ? [...props.preferredLanguages] : undefined,
			props.yearsOfExperience
		);
	}

	/**
	 * Reconstruct Profile from database/JSON
	 */
	static fromJSON(data: ProfileProps & { id: string }): Profile {
		return new Profile(
			data.id,
			data.userId,
			data.displayName,
			data.bio,
			[...data.skills],
			[...data.interests],
			data.availability,
			data.location,
			data.timezone,
			data.githubUrl,
			data.linkedinUrl,
			data.websiteUrl,
			data.preferredLanguages ? [...data.preferredLanguages] : undefined,
			data.yearsOfExperience
		);
	}

	/**
	 * Update bio
	 */
	updateBio(bio: string): void {
		if (!bio || bio.trim() === '') {
			throw new Error('Bio is required');
		}

		if (bio.length > 500) {
			throw new Error('Bio must not exceed 500 characters');
		}

		Object.assign(this, { bio });
	}

	/**
	 * Update availability status
	 */
	updateAvailability(availability: Availability): void {
		Object.assign(this, { availability });
	}

	/**
	 * Add skill (no duplicates)
	 */
	addSkill(skill: string): void {
		if (!this.skills.includes(skill)) {
			this.skills.push(skill);
		}
	}

	/**
	 * Remove skill
	 */
	removeSkill(skill: string): void {
		const index = this.skills.indexOf(skill);
		if (index === -1) return;

		if (this.skills.length === 1) {
			throw new Error('Profile must have at least one skill');
		}

		this.skills.splice(index, 1);
	}

	/**
	 * Add interest (no duplicates)
	 */
	addInterest(interest: string): void {
		if (!this.interests.includes(interest)) {
			this.interests.push(interest);
		}
	}

	/**
	 * Remove interest
	 */
	removeInterest(interest: string): void {
		const index = this.interests.indexOf(interest);
		if (index === -1) return;

		if (this.interests.length === 1) {
			throw new Error('Profile must have at least one interest');
		}

		this.interests.splice(index, 1);
	}

	/**
	 * Check if profile is complete enough for matching
	 * A complete profile has: bio with decent length, multiple skills, location, timezone
	 */
	isComplete(): boolean {
		return (
			this.bio.length >= 50 &&
			this.skills.length >= 2 &&
			this.interests.length >= 2 &&
			!!this.location &&
			!!this.timezone
		);
	}

	/**
	 * Serialize to plain object for database storage
	 */
	toJSON() {
		return {
			id: this.id,
			userId: this.userId,
			displayName: this.displayName,
			bio: this.bio,
			skills: [...this.skills],
			interests: [...this.interests],
			availability: this.availability,
			location: this.location,
			timezone: this.timezone,
			githubUrl: this.githubUrl,
			linkedinUrl: this.linkedinUrl,
			websiteUrl: this.websiteUrl,
			preferredLanguages: this.preferredLanguages ? [...this.preferredLanguages] : undefined,
			yearsOfExperience: this.yearsOfExperience,
		};
	}
}
