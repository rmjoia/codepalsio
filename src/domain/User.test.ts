import { describe, it, expect } from 'vitest';
import { User, type UserProps } from './User';

describe('User Domain Model', () => {
	describe('User Creation', () => {
		it('should create a valid user with required fields', () => {
			const props: UserProps = {
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://avatars.githubusercontent.com/u/12345',
				role: 'user',
			};

			const user = User.create(props);

			expect(user.githubId).toBe('12345');
			expect(user.githubUsername).toBe('testuser');
			expect(user.avatarUrl).toBe('https://avatars.githubusercontent.com/u/12345');
			expect(user.role).toBe('user');
			expect(user.approvalStatus).toBe('pending_profile');
			expect(user.karmaPoints).toBe(0);
		});

		it('should set registration date automatically', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			expect(user.registrationDate).toBeInstanceOf(Date);
			expect(user.lastLogin).toBeInstanceOf(Date);
		});

		it('should throw error if githubId is empty', () => {
			expect(() =>
				User.create({
					githubId: '',
					githubUsername: 'testuser',
					avatarUrl: 'https://example.com/avatar.jpg',
					role: 'user',
				})
			).toThrow('GitHub ID is required');
		});

		it('should throw error if githubUsername is empty', () => {
			expect(() =>
				User.create({
					githubId: '12345',
					githubUsername: '',
					avatarUrl: 'https://example.com/avatar.jpg',
					role: 'user',
				})
			).toThrow('GitHub username is required');
		});

		it('should throw error if avatarUrl is invalid', () => {
			expect(() =>
				User.create({
					githubId: '12345',
					githubUsername: 'testuser',
					avatarUrl: 'not-a-url',
					role: 'user',
				})
			).toThrow('Invalid avatar URL');
		});

		it('should accept valid role types', () => {
			const adminUser = User.create({
				githubId: '12345',
				githubUsername: 'admin',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'admin',
			});

			expect(adminUser.role).toBe('admin');
			expect(adminUser.isAdmin()).toBe(true);
		});
	});

	describe('User Methods', () => {
		it('should update last login timestamp', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			const originalLogin = user.lastLogin;
			// Wait a tiny bit to ensure timestamp difference
			setTimeout(() => {
				user.updateLastLogin();
				expect(user.lastLogin.getTime()).toBeGreaterThan(originalLogin.getTime());
			}, 10);
		});

		it('should approve user profile', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			user.approve();

			expect(user.approvalStatus).toBe('approved');
			expect(user.isApproved()).toBe(true);
		});

		it('should reject user profile', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			user.reject();

			expect(user.approvalStatus).toBe('rejected');
			expect(user.isApproved()).toBe(false);
		});

		it('should add karma points', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			user.addKarma(10);
			expect(user.karmaPoints).toBe(10);

			user.addKarma(5);
			expect(user.karmaPoints).toBe(15);
		});

		it('should not allow negative karma', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			expect(() => user.addKarma(-5)).toThrow('Karma points cannot be negative');
		});

		it('should add badges', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			user.addBadge('helping-hand');
			expect(user.badges).toContain('helping-hand');

			user.addBadge('community-champion');
			expect(user.badges).toHaveLength(2);
		});

		it('should not add duplicate badges', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			user.addBadge('helping-hand');
			user.addBadge('helping-hand');

			expect(user.badges).toHaveLength(1);
		});
	});

	describe('User Serialization', () => {
		it('should serialize to plain object', () => {
			const user = User.create({
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				role: 'user',
			});

			const serialized = user.toJSON();

			expect(serialized).toHaveProperty('id');
			expect(serialized.githubId).toBe('12345');
			expect(serialized.githubUsername).toBe('testuser');
			expect(serialized.approvalStatus).toBe('pending_profile');
		});

		it('should reconstruct from plain object', () => {
			const data = {
				id: 'user-123',
				githubId: '12345',
				githubUsername: 'testuser',
				avatarUrl: 'https://example.com/avatar.jpg',
				registrationDate: new Date('2025-01-01'),
				lastLogin: new Date('2025-01-02'),
				approvalStatus: 'approved' as const,
				role: 'user' as const,
				karmaPoints: 25,
				badges: ['helping-hand'],
			};

			const user = User.fromJSON(data);

			expect(user.id).toBe('user-123');
			expect(user.githubId).toBe('12345');
			expect(user.karmaPoints).toBe(25);
			expect(user.badges).toContain('helping-hand');
		});
	});
});
