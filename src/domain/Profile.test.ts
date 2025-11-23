import { describe, it, expect } from 'vitest';
import { Profile, type ProfileProps } from './Profile';

describe('Profile Domain Model', () => {
	describe('Profile Creation', () => {
		it('should create a valid profile with required fields', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Full-stack developer',
				skills: ['TypeScript', 'React', 'Node.js'],
				interests: ['Open Source', 'Web Development'],
				availability: 'available',
			};

			const profile = Profile.create(props);

			expect(profile.userId).toBe('user-123');
			expect(profile.displayName).toBe('John Doe');
			expect(profile.bio).toBe('Full-stack developer');
			expect(profile.skills).toEqual(['TypeScript', 'React', 'Node.js']);
			expect(profile.interests).toEqual(['Open Source', 'Web Development']);
			expect(profile.availability).toBe('available');
			expect(profile.id).toMatch(/^profile-/);
		});

		it('should generate unique profile IDs', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			};

			const profile1 = Profile.create(props);
			const profile2 = Profile.create(props);

			expect(profile1.id).not.toBe(profile2.id);
		});

		it('should throw error if userId is empty', () => {
			const props: ProfileProps = {
				userId: '',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			};

			expect(() => Profile.create(props)).toThrow('User ID is required');
		});

		it('should throw error if displayName is empty', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: '',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			};

			expect(() => Profile.create(props)).toThrow('Display name is required');
		});

		it('should throw error if bio exceeds 500 characters', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'a'.repeat(501),
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			};

			expect(() => Profile.create(props)).toThrow('Bio must not exceed 500 characters');
		});

		it('should throw error if skills array is empty', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: [],
				interests: ['Coding'],
				availability: 'available',
			};

			expect(() => Profile.create(props)).toThrow('At least one skill is required');
		});

		it('should throw error if interests array is empty', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: [],
				availability: 'available',
			};

			expect(() => Profile.create(props)).toThrow('At least one interest is required');
		});

		it('should accept valid availability values', () => {
			const availabilities: Array<'available' | 'busy' | 'unavailable'> = [
				'available',
				'busy',
				'unavailable',
			];

			availabilities.forEach((availability) => {
				const props: ProfileProps = {
					userId: 'user-123',
					displayName: 'John Doe',
					bio: 'Developer',
					skills: ['TypeScript'],
					interests: ['Coding'],
					availability,
				};

				const profile = Profile.create(props);
				expect(profile.availability).toBe(availability);
			});
		});

		it('should accept optional fields', () => {
			const props: ProfileProps = {
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
				location: 'San Francisco',
				timezone: 'America/Los_Angeles',
				githubUrl: 'https://github.com/johndoe',
				linkedinUrl: 'https://linkedin.com/in/johndoe',
				websiteUrl: 'https://johndoe.dev',
			};

			const profile = Profile.create(props);

			expect(profile.location).toBe('San Francisco');
			expect(profile.timezone).toBe('America/Los_Angeles');
			expect(profile.githubUrl).toBe('https://github.com/johndoe');
			expect(profile.linkedinUrl).toBe('https://linkedin.com/in/johndoe');
			expect(profile.websiteUrl).toBe('https://johndoe.dev');
		});
	});

	describe('Profile Methods', () => {
		it('should update bio', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Old bio',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.updateBio('New bio');

			expect(profile.bio).toBe('New bio');
		});

		it('should throw error when updating bio exceeds 500 characters', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Old bio',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			expect(() => profile.updateBio('a'.repeat(501))).toThrow(
				'Bio must not exceed 500 characters'
			);
		});

		it('should update availability', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.updateAvailability('busy');

			expect(profile.availability).toBe('busy');
		});

		it('should add skill', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.addSkill('React');

			expect(profile.skills).toContain('React');
			expect(profile.skills.length).toBe(2);
		});

		it('should not add duplicate skill', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.addSkill('TypeScript');

			expect(profile.skills.length).toBe(1);
		});

		it('should remove skill', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript', 'React'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.removeSkill('TypeScript');

			expect(profile.skills).not.toContain('TypeScript');
			expect(profile.skills).toContain('React');
		});

		it('should throw error when removing last skill', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			expect(() => profile.removeSkill('TypeScript')).toThrow(
				'Profile must have at least one skill'
			);
		});

		it('should add interest', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.addInterest('Open Source');

			expect(profile.interests).toContain('Open Source');
			expect(profile.interests.length).toBe(2);
		});

		it('should not add duplicate interest', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			profile.addInterest('Coding');

			expect(profile.interests.length).toBe(1);
		});

		it('should remove interest', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding', 'Open Source'],
				availability: 'available',
			});

			profile.removeInterest('Coding');

			expect(profile.interests).not.toContain('Coding');
			expect(profile.interests).toContain('Open Source');
		});

		it('should throw error when removing last interest', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			expect(() => profile.removeInterest('Coding')).toThrow(
				'Profile must have at least one interest'
			);
		});

		it('should check if profile is complete', () => {
			const incompleteProfile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
			});

			expect(incompleteProfile.isComplete()).toBe(false);

			const completeProfile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Full-stack developer with 5 years experience building scalable web applications. Passionate about clean code and mentoring.',
				skills: ['TypeScript', 'React', 'Node.js'],
				interests: ['Open Source', 'Mentoring'],
				availability: 'available',
				location: 'San Francisco',
				timezone: 'America/Los_Angeles',
			});

			expect(completeProfile.isComplete()).toBe(true);
		});
	});

	describe('Profile Serialization', () => {
		it('should serialize to plain object', () => {
			const profile = Profile.create({
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript'],
				interests: ['Coding'],
				availability: 'available',
				location: 'San Francisco',
			});

			const json = profile.toJSON();

			expect(json).toHaveProperty('id');
			expect(json).toHaveProperty('userId', 'user-123');
			expect(json).toHaveProperty('displayName', 'John Doe');
			expect(json).toHaveProperty('bio', 'Developer');
			expect(json).toHaveProperty('skills');
			expect(json).toHaveProperty('interests');
			expect(json).toHaveProperty('availability', 'available');
			expect(json).toHaveProperty('location', 'San Francisco');
		});

		it('should reconstruct from plain object', () => {
			const data = {
				id: 'profile-123',
				userId: 'user-123',
				displayName: 'John Doe',
				bio: 'Developer',
				skills: ['TypeScript', 'React'],
				interests: ['Coding', 'Open Source'],
				availability: 'available' as const,
				location: 'San Francisco',
				timezone: 'America/Los_Angeles',
			};

			const profile = Profile.fromJSON(data);

			expect(profile.id).toBe('profile-123');
			expect(profile.userId).toBe('user-123');
			expect(profile.displayName).toBe('John Doe');
			expect(profile.bio).toBe('Developer');
			expect(profile.skills).toEqual(['TypeScript', 'React']);
			expect(profile.interests).toEqual(['Coding', 'Open Source']);
			expect(profile.availability).toBe('available');
			expect(profile.location).toBe('San Francisco');
			expect(profile.timezone).toBe('America/Los_Angeles');
		});
	});
});
