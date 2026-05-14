/**
 * Welcome-page onboarding form: three required-acknowledgement
 * checkboxes (`accept-terms`, `accept-privacy`, `accept-coc`) gating
 * a `continue-btn`. The button enables only when all three are
 * checked; clicking advances to `/profile/setup`.
 *
 * No-op on pages that don't have these IDs — safe to set up
 * globally from Header.astro's bundled script.
 *
 * Lives in src/lib/ so it can be imported by Header.astro — keeping
 * it out of any per-page inline `<script>` block that CSP
 * `script-src 'self'` would block.
 */

const CHECKBOX_IDS = ['accept-terms', 'accept-privacy', 'accept-coc'] as const;

let installed = false;

function updateContinueButton(): void {
	const continueBtn = document.getElementById('continue-btn') as HTMLButtonElement | null;
	if (!continueBtn) return;
	const allChecked = CHECKBOX_IDS.every((id) => {
		const cb = document.getElementById(id) as HTMLInputElement | null;
		return !!cb?.checked;
	});
	continueBtn.disabled = !allChecked;
	continueBtn.classList.toggle('opacity-50', !allChecked);
	continueBtn.classList.toggle('cursor-not-allowed', !allChecked);
	continueBtn.classList.toggle('hover:bg-primary-600', allChecked);
}

export function setupOnboardingForm(): void {
	if (installed) return;
	// Detect presence — bail if this isn't the welcome page.
	if (!document.getElementById('continue-btn')) return;
	installed = true;

	CHECKBOX_IDS.forEach((id) => {
		document.getElementById(id)?.addEventListener('change', updateContinueButton);
	});

	// TODO: Call API to save terms acceptance with timestamps. For
	// now, redirect to profile setup once all checkboxes are ticked.
	document.getElementById('continue-btn')?.addEventListener('click', () => {
		window.location.href = '/profile/setup';
	});
}
